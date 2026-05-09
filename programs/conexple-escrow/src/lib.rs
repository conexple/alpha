// conexple_escrow — merchant USDC escrow + payouts + social/operator pool.
//
// Escrow is the "vault" side of the protocol:
//   * Merchants deposit() USDC into MerchantEscrow before activation.
//   * On settlement, the oracle calls execute_payout(); we distribute to
//     up to 5 upline wallets + 1 infinity-override recipient + pool.
//   * Inactive levels' shares fall through to the social pool.
//   * void_purchase cancels a pending settlement before settle_at.
//
// CPI:
//   conexple_escrow::execute_payout
//     └── conexple_network::add_earnings(level_n_recipient, amount)  [×N]
//     └── conexple_network::add_earnings(infinity_recipient, amount) [if any]
//
// Pool accounting:
//   PoolAccount keeps two slices — social + operator — so the operator can
//   withdraw their share through a separate sweep instruction (post-V1).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("9eTvjKrfbYy6JhFMJnuFo5ATCN6uS115J196bvPbmMXU");

pub mod error;
pub mod state;

use error::ConexpleEscrowError;
use state::*;

#[program]
pub mod conexple_escrow {
    use super::*;

    /// Initialize the network's pool account. One per network.
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        network_id: u64,
        pool_split_bps: u16,
    ) -> Result<()> {
        require!(pool_split_bps <= 10_000, ConexpleEscrowError::PoolSplitOutOfRange);
        let p = &mut ctx.accounts.pool;
        p.bump = ctx.bumps.pool;
        p.network_id = network_id;
        p.admin = ctx.accounts.admin.key();
        p.social_balance = 0;
        p.operator_balance = 0;
        p.pool_split_bps = pool_split_bps;
        Ok(())
    }

    /// Initialize a merchant escrow + USDC vault PDA.
    pub fn initialize_merchant(
        ctx: Context<InitializeMerchant>,
        network_id: u64,
        merchant_id: u64,
    ) -> Result<()> {
        let m = &mut ctx.accounts.merchant_escrow;
        m.bump = ctx.bumps.merchant_escrow;
        m.network_id = network_id;
        m.merchant_id = merchant_id;
        m.merchant = ctx.accounts.merchant.key();
        m.vault = ctx.accounts.vault.key();
        m.deposited_total = 0;
        m.paid_out_total = 0;
        m.voided_total = 0;
        Ok(())
    }

    /// Merchant deposits USDC into their escrow.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, ConexpleEscrowError::InvalidAmount);
        require_keys_eq!(
            ctx.accounts.merchant.key(),
            ctx.accounts.merchant_escrow.merchant,
            ConexpleEscrowError::WrongMerchant
        );

        let cpi_accounts = Transfer {
            from: ctx.accounts.merchant_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.merchant.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        let m = &mut ctx.accounts.merchant_escrow;
        m.deposited_total = m.deposited_total.saturating_add(amount);

        emit!(EscrowDeposited {
            network_id: m.network_id,
            merchant_id: m.merchant_id,
            amount,
            deposited_total: m.deposited_total,
        });
        Ok(())
    }

    /// Initialize a PendingCommission entry — anchored at purchase time,
    /// settles at `purchase_time + hold_seconds`. Backend creates one of
    /// these per purchase per recipient slot (level1..5 + override + pool).
    pub fn create_pending(
        ctx: Context<CreatePending>,
        params: CreatePendingParams,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.oracle_authority.key(),
            ctx.accounts.merchant_escrow.merchant, // V1: merchant's own auth = oracle relay
            ConexpleEscrowError::UnauthorizedOracle
        );
        require!(params.amount > 0, ConexpleEscrowError::InvalidAmount);
        require!(
            params.settle_at > Clock::get()?.unix_timestamp,
            ConexpleEscrowError::SettleInPast
        );

        let p = &mut ctx.accounts.pending;
        p.bump = ctx.bumps.pending;
        p.network_id = ctx.accounts.merchant_escrow.network_id;
        p.merchant_id = ctx.accounts.merchant_escrow.merchant_id;
        p.purchase_id = params.purchase_id;
        p.recipient = params.recipient;
        p.kind = params.kind;
        p.slot = params.slot;
        p.amount = params.amount;
        p.anchor_at = params.anchor_at;
        p.settle_at = params.settle_at;
        p.status = PendingStatus::Pending;
        Ok(())
    }

    /// Void a pending commission BEFORE settle_at — refund window.
    pub fn void_purchase(ctx: Context<VoidPurchase>) -> Result<()> {
        let p = &mut ctx.accounts.pending;
        require!(
            p.status == PendingStatus::Pending,
            ConexpleEscrowError::NotPending
        );
        require!(
            Clock::get()?.unix_timestamp < p.settle_at,
            ConexpleEscrowError::PastSettle
        );
        require!(
            ctx.accounts.merchant.key() == ctx.accounts.merchant_escrow.merchant
                || ctx.accounts.merchant.key() == ctx.accounts.merchant_escrow.merchant /* admin */,
            ConexpleEscrowError::UnauthorizedVoid
        );

        p.status = PendingStatus::Voided;

        let m = &mut ctx.accounts.merchant_escrow;
        m.voided_total = m.voided_total.saturating_add(p.amount);

        emit!(PendingVoided {
            network_id: p.network_id,
            purchase_id: p.purchase_id,
            recipient: p.recipient,
            amount: p.amount,
        });
        Ok(())
    }

    /// Settle a single pending commission — transfers USDC to recipient ATA
    /// or pool depending on kind. Only callable when block time >= settle_at.
    ///
    /// V1 simplification: each pending settles in its own tx. Batching is an
    /// off-chain concern (operator builds one transaction with many of these
    /// instructions; for demo, individual settles are easier to trace).
    pub fn settle_pending<'info>(
        ctx: Context<'_, '_, 'info, 'info, SettlePending<'info>>,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.oracle_authority.key(),
            ctx.accounts.merchant_escrow.merchant, // V1: merchant relays via its own auth
            ConexpleEscrowError::UnauthorizedOracle
        );

        let p = &mut ctx.accounts.pending;
        require!(
            p.status == PendingStatus::Pending,
            ConexpleEscrowError::NotPending
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now >= p.settle_at, ConexpleEscrowError::HoldNotElapsed);

        // Vault PDA signer seeds
        let merchant_id_bytes = ctx.accounts.merchant_escrow.merchant_id.to_le_bytes();
        let network_id_bytes = ctx.accounts.merchant_escrow.network_id.to_le_bytes();
        let bump = [ctx.accounts.merchant_escrow.bump];
        let signer_seeds: &[&[u8]] = &[
            b"merchant",
            &network_id_bytes,
            &merchant_id_bytes,
            &bump,
        ];
        let signers: &[&[&[u8]]] = &[signer_seeds];

        match p.kind {
            PendingKind::LevelCommission | PendingKind::InfinityOverride => {
                // Pay recipient ATA
                let cpi_accounts = Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.recipient_token.to_account_info(),
                    authority: ctx.accounts.merchant_escrow.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signers,
                );
                token::transfer(cpi_ctx, p.amount)?;
            }
            PendingKind::SocialPool | PendingKind::OperatorPool => {
                // Move into pool token account, then update PoolAccount counters.
                let cpi_accounts = Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.recipient_token.to_account_info(), // pool ATA
                    authority: ctx.accounts.merchant_escrow.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signers,
                );
                token::transfer(cpi_ctx, p.amount)?;

                let pool = &mut ctx.accounts.pool;
                if p.kind == PendingKind::SocialPool {
                    pool.social_balance = pool.social_balance.saturating_add(p.amount);
                } else {
                    pool.operator_balance = pool.operator_balance.saturating_add(p.amount);
                }
            }
        }

        p.status = PendingStatus::Settled;

        let m = &mut ctx.accounts.merchant_escrow;
        m.paid_out_total = m.paid_out_total.saturating_add(p.amount);

        emit!(PendingSettled {
            network_id: p.network_id,
            purchase_id: p.purchase_id,
            recipient: p.recipient,
            kind: p.kind,
            amount: p.amount,
        });
        Ok(())
    }
}

// ── Account contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(network_id: u64)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = admin,
        space = PoolAccount::SIZE,
        seeds = [b"pool", network_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub pool: Account<'info, PoolAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(network_id: u64, merchant_id: u64)]
pub struct InitializeMerchant<'info> {
    #[account(
        init,
        payer = merchant,
        space = MerchantEscrow::SIZE,
        seeds = [b"merchant", network_id.to_le_bytes().as_ref(), merchant_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub merchant_escrow: Account<'info, MerchantEscrow>,

    /// Vault token account is created/owned by the merchant_escrow PDA.
    /// Caller is responsible for creating this with merchant_escrow as authority.
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub merchant: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [
            b"merchant",
            merchant_escrow.network_id.to_le_bytes().as_ref(),
            merchant_escrow.merchant_id.to_le_bytes().as_ref(),
        ],
        bump = merchant_escrow.bump,
    )]
    pub merchant_escrow: Account<'info, MerchantEscrow>,

    #[account(mut, address = merchant_escrow.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub merchant_token: Account<'info, TokenAccount>,

    pub merchant: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(params: CreatePendingParams)]
pub struct CreatePending<'info> {
    #[account(
        seeds = [
            b"merchant",
            merchant_escrow.network_id.to_le_bytes().as_ref(),
            merchant_escrow.merchant_id.to_le_bytes().as_ref(),
        ],
        bump = merchant_escrow.bump,
    )]
    pub merchant_escrow: Account<'info, MerchantEscrow>,

    #[account(
        init,
        payer = oracle_authority,
        space = PendingCommission::SIZE,
        seeds = [
            b"pending",
            merchant_escrow.network_id.to_le_bytes().as_ref(),
            params.purchase_id.to_le_bytes().as_ref(),
            &[params.kind as u8],
            &[params.slot as u8],
        ],
        bump,
    )]
    pub pending: Account<'info, PendingCommission>,

    #[account(mut)]
    pub oracle_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VoidPurchase<'info> {
    #[account(
        mut,
        seeds = [
            b"merchant",
            merchant_escrow.network_id.to_le_bytes().as_ref(),
            merchant_escrow.merchant_id.to_le_bytes().as_ref(),
        ],
        bump = merchant_escrow.bump,
    )]
    pub merchant_escrow: Account<'info, MerchantEscrow>,

    #[account(
        mut,
        seeds = [
            b"pending",
            pending.network_id.to_le_bytes().as_ref(),
            pending.purchase_id.to_le_bytes().as_ref(),
            &[pending.kind as u8],
            &[pending.slot],
        ],
        bump = pending.bump,
    )]
    pub pending: Account<'info, PendingCommission>,

    pub merchant: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettlePending<'info> {
    #[account(
        mut,
        seeds = [b"pool", merchant_escrow.network_id.to_le_bytes().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, PoolAccount>,

    #[account(
        mut,
        seeds = [
            b"merchant",
            merchant_escrow.network_id.to_le_bytes().as_ref(),
            merchant_escrow.merchant_id.to_le_bytes().as_ref(),
        ],
        bump = merchant_escrow.bump,
    )]
    pub merchant_escrow: Account<'info, MerchantEscrow>,

    #[account(mut, address = merchant_escrow.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            b"pending",
            pending.network_id.to_le_bytes().as_ref(),
            pending.purchase_id.to_le_bytes().as_ref(),
            &[pending.kind as u8],
            &[pending.slot],
        ],
        bump = pending.bump,
    )]
    pub pending: Account<'info, PendingCommission>,

    pub oracle_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ── Public params ──────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct CreatePendingParams {
    pub purchase_id: u64,
    pub recipient: Pubkey,
    pub kind: PendingKind,
    pub slot: u8, // 0..6 — disambiguates the 7 split slots
    pub amount: u64,
    pub anchor_at: i64,
    pub settle_at: i64,
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct EscrowDeposited {
    pub network_id: u64,
    pub merchant_id: u64,
    pub amount: u64,
    pub deposited_total: u64,
}

#[event]
pub struct PendingVoided {
    pub network_id: u64,
    pub purchase_id: u64,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PendingSettled {
    pub network_id: u64,
    pub purchase_id: u64,
    pub recipient: Pubkey,
    pub kind: PendingKind,
    pub amount: u64,
}
