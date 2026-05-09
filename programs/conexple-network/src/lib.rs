// conexple_network — single source of truth for Position state.
//
// docs/02 §7,§8 — on-chain ownership of network structure.
// docs/03 §4 — single-source-of-truth-per-program. Other programs (escrow,
//              oracle) MUST go through CPI here to mutate Position.
//
// State machine (docs/03 §5):
//
//   Active ──extend──▶ Active
//   Active ──earn≥cap─▶ Active(extension_locked = true)
//   Active ──no extend × 2 cycles──▶ Expired
//   Expired ──force_expire by ops/merchant──▶ Expired
//
// CPI authority model:
//   * register_member: any signer (a wallet registers itself)
//   * place_member: oracle only (proves backend's placement decision was
//                   recorded by the registered oracle)
//   * extend_position: CPI from conexple_escrow when a buyer's purchase
//                      lands (backend submits via oracle)
//   * add_earnings: CPI from conexple_escrow during execute_payout
//   * expire_position: permissionless — anyone can trigger when
//                      eligibility is on-chain provable
//   * force_expire: operator (admin) or per-merchant authority

use anchor_lang::prelude::*;

declare_id!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

pub mod error;
pub mod state;

use error::ConexpleNetworkError;
use state::*;

#[program]
pub mod conexple_network {
    use super::*;

    /// Initialize the network root account. One per network.
    pub fn initialize_network(
        ctx: Context<InitializeNetwork>,
        network_id: u64,
        oracle: Pubkey,
        cycle_seconds: i64,
    ) -> Result<()> {
        require!(cycle_seconds >= 24 * 60 * 60, ConexpleNetworkError::CycleTooFast);

        let net = &mut ctx.accounts.network;
        net.bump = ctx.bumps.network;
        net.network_id = network_id;
        net.admin = ctx.accounts.admin.key();
        net.oracle = oracle;
        net.cycle_seconds = cycle_seconds;
        net.cycle_index = 0;
        net.cycle_started_at = Clock::get()?.unix_timestamp;
        net.member_count = 0;
        Ok(())
    }

    /// Roll the cycle forward. Permissionless — anyone can call once
    /// `now >= cycle_started_at + cycle_seconds`.
    pub fn advance_cycle(ctx: Context<AdvanceCycle>) -> Result<()> {
        let net = &mut ctx.accounts.network;
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= net.cycle_started_at.saturating_add(net.cycle_seconds),
            ConexpleNetworkError::CycleNotElapsed
        );
        net.cycle_index = net.cycle_index.saturating_add(1);
        net.cycle_started_at = now;

        emit!(CycleAdvanced {
            network_id: net.network_id,
            cycle_index: net.cycle_index,
            started_at: now,
        });
        Ok(())
    }

    /// A wallet registers itself. Initial state: parent=None, depth=0,
    /// status=Active. Placement happens later via `place_member`.
    pub fn register_member(
        ctx: Context<RegisterMember>,
        initial_spend: u64,
        multiplier: u32,
    ) -> Result<()> {
        require!(initial_spend > 0, ConexpleNetworkError::InvalidInitialSpend);
        require!(multiplier > 0, ConexpleNetworkError::InvalidMultiplier);

        let pos = &mut ctx.accounts.position;
        let now = Clock::get()?.unix_timestamp;

        pos.bump = ctx.bumps.position;
        pos.network_id = ctx.accounts.network.network_id;
        pos.wallet = ctx.accounts.wallet.key();
        pos.parent = None;
        pos.depth = 0;
        pos.status = PositionStatus::Active;
        pos.cumulative_earned = 0;
        pos.earnings_cap = initial_spend.saturating_mul(multiplier as u64);
        pos.last_purchase_round = ctx.accounts.network.cycle_index;
        pos.extension_locked = false;
        pos.joined_at = now;
        pos.expired_at = None;

        let net = &mut ctx.accounts.network;
        net.member_count = net.member_count.saturating_add(1);

        emit!(MemberRegistered {
            network_id: pos.network_id,
            wallet: pos.wallet,
            joined_at: now,
        });
        Ok(())
    }

    /// Oracle-attested placement. The oracle PDA must match
    /// `network.oracle`; this is how the off-chain placement engine's
    /// decision lands on-chain with cryptographic provenance.
    pub fn place_member(ctx: Context<PlaceMember>) -> Result<()> {
        // Oracle-only authorization
        require_keys_eq!(
            ctx.accounts.oracle_authority.key(),
            ctx.accounts.network.oracle,
            ConexpleNetworkError::UnauthorizedPlacementSigner
        );

        // Position must be unplaced (parent=None) and active
        let pos = &mut ctx.accounts.position;
        require!(pos.parent.is_none(), ConexpleNetworkError::AlreadyPlaced);
        require!(
            pos.status == PositionStatus::Active,
            ConexpleNetworkError::PositionNotActive
        );

        let parent = &ctx.accounts.parent_position;
        require!(
            parent.status == PositionStatus::Active,
            ConexpleNetworkError::ParentNotActive
        );
        let new_depth = parent.depth.saturating_add(1);
        require!(
            new_depth <= MAX_PLACEMENT_DEPTH,
            ConexpleNetworkError::PlacementTooDeep
        );

        pos.parent = Some(parent.wallet);
        pos.depth = new_depth;

        emit!(MemberPlaced {
            network_id: pos.network_id,
            child: pos.wallet,
            parent: parent.wallet,
            depth: new_depth,
        });
        Ok(())
    }

    /// Buyer purchase event. Records one PurchaseRecord per (wallet, round)
    /// for deduplication, then bumps last_purchase_round if not locked.
    pub fn record_purchase(
        ctx: Context<RecordPurchase>,
        round: u64,
        amount: u64,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.oracle_authority.key(),
            ctx.accounts.network.oracle,
            ConexpleNetworkError::UnauthorizedOracle
        );
        require!(amount > 0, ConexpleNetworkError::InvalidPurchaseAmount);
        require_eq!(round, ctx.accounts.network.cycle_index, ConexpleNetworkError::RoundMismatch);

        let rec = &mut ctx.accounts.purchase;
        rec.bump = ctx.bumps.purchase;
        rec.network_id = ctx.accounts.network.network_id;
        rec.wallet = ctx.accounts.position.wallet;
        rec.round = round;
        rec.total_amount = rec.total_amount.saturating_add(amount);
        rec.purchase_count = rec.purchase_count.saturating_add(1);
        rec.last_at = Clock::get()?.unix_timestamp;

        let pos = &mut ctx.accounts.position;
        if !pos.extension_locked && pos.status == PositionStatus::Active {
            pos.last_purchase_round = round;
        }

        emit!(PurchaseRecorded {
            network_id: rec.network_id,
            wallet: rec.wallet,
            round,
            amount,
            total_in_round: rec.total_amount,
        });
        Ok(())
    }

    /// CPI from conexple_escrow during execute_payout.
    /// Increments cumulative_earned; locks extension when cap reached.
    pub fn add_earnings(ctx: Context<AddEarnings>, amount: u64) -> Result<()> {
        // Caller authority: must match the program-derived signer of an
        // approved caller (escrow program). For V1, simplest authorization:
        // the network's `oracle` signs when escrow runs the payout instruction.
        require_keys_eq!(
            ctx.accounts.oracle_authority.key(),
            ctx.accounts.network.oracle,
            ConexpleNetworkError::UnauthorizedOracle
        );
        require!(amount > 0, ConexpleNetworkError::InvalidEarningsAmount);

        let pos = &mut ctx.accounts.position;
        require!(
            pos.status == PositionStatus::Active,
            ConexpleNetworkError::PositionNotActive
        );

        pos.cumulative_earned = pos.cumulative_earned.saturating_add(amount);

        if pos.cumulative_earned >= pos.earnings_cap && !pos.extension_locked {
            pos.extension_locked = true;
            emit!(PositionLocked {
                network_id: pos.network_id,
                wallet: pos.wallet,
                cumulative_earned: pos.cumulative_earned,
                cap: pos.earnings_cap,
            });
        }

        emit!(EarningsAdded {
            network_id: pos.network_id,
            wallet: pos.wallet,
            amount,
            cumulative: pos.cumulative_earned,
        });
        Ok(())
    }

    /// Permissionless expiry — eligibility provable on-chain.
    /// docs/03 §5: 2 cycles since last_purchase_round → expire.
    pub fn expire_position(ctx: Context<ExpirePosition>) -> Result<()> {
        let pos = &mut ctx.accounts.position;
        require!(
            pos.status == PositionStatus::Active,
            ConexpleNetworkError::PositionNotActive
        );

        let net = &ctx.accounts.network;
        let elapsed = net.cycle_index.saturating_sub(pos.last_purchase_round);
        require!(elapsed > 2, ConexpleNetworkError::ExpiryNotEligible);

        pos.status = PositionStatus::Expired;
        pos.expired_at = Some(Clock::get()?.unix_timestamp);

        emit!(PositionExpired {
            network_id: pos.network_id,
            wallet: pos.wallet,
            reason: ExpireReason::Inactivity,
            cycles_inactive: elapsed,
        });
        Ok(())
    }

    /// Operator-only force expire (docs/03 §6 — auto-threshold or manual ops).
    pub fn force_expire(ctx: Context<ForceExpire>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.network.admin,
            ConexpleNetworkError::UnauthorizedAdmin
        );

        let pos = &mut ctx.accounts.position;
        require!(
            pos.status == PositionStatus::Active,
            ConexpleNetworkError::PositionNotActive
        );
        pos.status = PositionStatus::Expired;
        pos.expired_at = Some(Clock::get()?.unix_timestamp);

        emit!(PositionExpired {
            network_id: pos.network_id,
            wallet: pos.wallet,
            reason: ExpireReason::Forced,
            cycles_inactive: 0,
        });
        Ok(())
    }
}

// ── Account contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(network_id: u64)]
pub struct InitializeNetwork<'info> {
    #[account(
        init,
        payer = admin,
        space = NetworkState::SIZE,
        seeds = [b"network", &network_id.to_le_bytes()],
        bump,
    )]
    pub network: Account<'info, NetworkState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdvanceCycle<'info> {
    #[account(
        mut,
        seeds = [b"network", &network.network_id.to_le_bytes()],
        bump = network.bump,
    )]
    pub network: Account<'info, NetworkState>,
}

#[derive(Accounts)]
pub struct RegisterMember<'info> {
    #[account(
        mut,
        seeds = [b"network", &network.network_id.to_le_bytes()],
        bump = network.bump,
    )]
    pub network: Account<'info, NetworkState>,

    #[account(
        init,
        payer = wallet,
        space = Position::SIZE,
        seeds = [b"position", &network.network_id.to_le_bytes(), wallet.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub wallet: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceMember<'info> {
    #[account(
        seeds = [b"network", &network.network_id.to_le_bytes()],
        bump = network.bump,
    )]
    pub network: Account<'info, NetworkState>,

    #[account(
        mut,
        seeds = [b"position", &network.network_id.to_le_bytes(), position.wallet.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    #[account(
        seeds = [b"position", &network.network_id.to_le_bytes(), parent_position.wallet.as_ref()],
        bump = parent_position.bump,
        constraint = parent_position.network_id == network.network_id @ ConexpleNetworkError::WrongNetwork,
    )]
    pub parent_position: Account<'info, Position>,

    pub oracle_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(round: u64)]
pub struct RecordPurchase<'info> {
    #[account(
        seeds = [b"network", &network.network_id.to_le_bytes()],
        bump = network.bump,
    )]
    pub network: Account<'info, NetworkState>,

    #[account(
        mut,
        seeds = [b"position", &network.network_id.to_le_bytes(), position.wallet.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    #[account(
        init_if_needed,
        payer = oracle_authority,
        space = PurchaseRecord::SIZE,
        seeds = [
            b"purchase",
            &network.network_id.to_le_bytes(),
            position.wallet.as_ref(),
            &round.to_le_bytes(),
        ],
        bump,
    )]
    pub purchase: Account<'info, PurchaseRecord>,

    #[account(mut)]
    pub oracle_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddEarnings<'info> {
    #[account(
        seeds = [b"network", &network.network_id.to_le_bytes()],
        bump = network.bump,
    )]
    pub network: Account<'info, NetworkState>,

    #[account(
        mut,
        seeds = [b"position", &network.network_id.to_le_bytes(), position.wallet.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    pub oracle_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExpirePosition<'info> {
    #[account(
        seeds = [b"network", &network.network_id.to_le_bytes()],
        bump = network.bump,
    )]
    pub network: Account<'info, NetworkState>,

    #[account(
        mut,
        seeds = [b"position", &network.network_id.to_le_bytes(), position.wallet.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct ForceExpire<'info> {
    #[account(
        seeds = [b"network", &network.network_id.to_le_bytes()],
        bump = network.bump,
    )]
    pub network: Account<'info, NetworkState>,

    #[account(
        mut,
        seeds = [b"position", &network.network_id.to_le_bytes(), position.wallet.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    pub authority: Signer<'info>,
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct CycleAdvanced {
    pub network_id: u64,
    pub cycle_index: u64,
    pub started_at: i64,
}

#[event]
pub struct MemberRegistered {
    pub network_id: u64,
    pub wallet: Pubkey,
    pub joined_at: i64,
}

#[event]
pub struct MemberPlaced {
    pub network_id: u64,
    pub child: Pubkey,
    pub parent: Pubkey,
    pub depth: u8,
}

#[event]
pub struct PurchaseRecorded {
    pub network_id: u64,
    pub wallet: Pubkey,
    pub round: u64,
    pub amount: u64,
    pub total_in_round: u64,
}

#[event]
pub struct EarningsAdded {
    pub network_id: u64,
    pub wallet: Pubkey,
    pub amount: u64,
    pub cumulative: u64,
}

#[event]
pub struct PositionLocked {
    pub network_id: u64,
    pub wallet: Pubkey,
    pub cumulative_earned: u64,
    pub cap: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum ExpireReason {
    Inactivity,
    Forced,
}

#[event]
pub struct PositionExpired {
    pub network_id: u64,
    pub wallet: Pubkey,
    pub reason: ExpireReason,
    pub cycles_inactive: u64,
}
