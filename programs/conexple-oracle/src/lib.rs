// conexple_oracle — registry of authorized off-chain signers.
//
// Why a separate program (not just a column on NetworkState)?
//   * Future networks may want multiple oracles (replication, failover).
//   * The registry is `network`-scoped but `program`-owned for clean
//     governance separation: an admin upgrade to oracle policy doesn't
//     require redeploying the network program.
//
// V1 scope: a single `OracleRegistry` per network. `register_oracle` adds
// a pubkey; `revoke_oracle` removes it. `submit_payout` is a thin wrapper
// that the operator backend calls so the audit trail attributes a payout
// instruction explicitly to "oracle X submitted at time T".
//
// Note: actual mutation of network/escrow state happens via direct CPI from
// those programs themselves (they check `network.oracle == signer`). The
// registry exists so we can point `network.oracle` at a registered key
// rather than a free-floating one.

use anchor_lang::prelude::*;

declare_id!("9CQFV9oPYKWE4Yg4w8mwJxsdibPeZJrKoTqcp2iTi1qz");

pub mod error;
pub mod state;

use error::ConexpleOracleError;
use state::*;

#[program]
pub mod conexple_oracle {
    use super::*;

    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        network_id: u64,
    ) -> Result<()> {
        let r = &mut ctx.accounts.registry;
        r.bump = ctx.bumps.registry;
        r.network_id = network_id;
        r.admin = ctx.accounts.admin.key();
        r.signers = Vec::new();
        Ok(())
    }

    pub fn register_oracle(
        ctx: Context<RegisterOracle>,
        oracle_pubkey: Pubkey,
    ) -> Result<()> {
        let r = &mut ctx.accounts.registry;
        require_keys_eq!(r.admin, ctx.accounts.admin.key(), ConexpleOracleError::Unauthorized);
        require!(
            r.signers.len() < OracleRegistry::MAX_SIGNERS,
            ConexpleOracleError::TooManySigners
        );
        require!(
            !r.signers.contains(&oracle_pubkey),
            ConexpleOracleError::AlreadyRegistered
        );
        r.signers.push(oracle_pubkey);

        emit!(OracleRegistered {
            network_id: r.network_id,
            oracle: oracle_pubkey,
        });
        Ok(())
    }

    pub fn revoke_oracle(
        ctx: Context<RevokeOracle>,
        oracle_pubkey: Pubkey,
    ) -> Result<()> {
        let r = &mut ctx.accounts.registry;
        require_keys_eq!(r.admin, ctx.accounts.admin.key(), ConexpleOracleError::Unauthorized);
        let len_before = r.signers.len();
        r.signers.retain(|p| p != &oracle_pubkey);
        require!(
            r.signers.len() < len_before,
            ConexpleOracleError::NotRegistered
        );

        emit!(OracleRevoked {
            network_id: r.network_id,
            oracle: oracle_pubkey,
        });
        Ok(())
    }

    /// Audit-only entry point. Off-chain backend calls this *in addition*
    /// to whatever instruction it's actually submitting (record_purchase,
    /// settle_pending, etc.) so we have an on-chain log that "oracle X
    /// submitted purpose=foo at time T". Cheap; pays for itself in audit
    /// clarity.
    pub fn log_submission(
        ctx: Context<LogSubmission>,
        purpose: SubmissionPurpose,
        ref_id: u64,
    ) -> Result<()> {
        let r = &ctx.accounts.registry;
        require!(
            r.signers.contains(&ctx.accounts.oracle_signer.key()),
            ConexpleOracleError::SignerNotRegistered
        );
        emit!(OracleSubmitted {
            network_id: r.network_id,
            oracle: ctx.accounts.oracle_signer.key(),
            purpose,
            ref_id,
            submitted_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

// ── Account contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(network_id: u64)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = admin,
        space = OracleRegistry::SIZE,
        seeds = [b"oracle_registry", &network_id.to_le_bytes()],
        bump,
    )]
    pub registry: Account<'info, OracleRegistry>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterOracle<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry", &registry.network_id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, OracleRegistry>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct RevokeOracle<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry", &registry.network_id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, OracleRegistry>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct LogSubmission<'info> {
    #[account(
        seeds = [b"oracle_registry", &registry.network_id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, OracleRegistry>,
    pub oracle_signer: Signer<'info>,
}

// ── Public params + events ─────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum SubmissionPurpose {
    PlaceMember = 0,
    RecordPurchase = 1,
    AddEarnings = 2,
    SettlePending = 3,
    Other = 255,
}

#[event]
pub struct OracleRegistered {
    pub network_id: u64,
    pub oracle: Pubkey,
}

#[event]
pub struct OracleRevoked {
    pub network_id: u64,
    pub oracle: Pubkey,
}

#[event]
pub struct OracleSubmitted {
    pub network_id: u64,
    pub oracle: Pubkey,
    pub purpose: SubmissionPurpose,
    pub ref_id: u64,
    pub submitted_at: i64,
}
