// conexple_protocol — protocol rules + placement verification.
//
// Owns ProtocolConfig (immutable rule snapshot for an operator network).
// Other programs read these rules via account; mutation requires the admin
// authority recorded in ProtocolConfig.
//
// Hard constraints enforced here (cannot be bypassed by any operator):
//   * margin_bps <= 5_000              (50% margin cap — docs/02 §3)
//   * cycle != Hourly && != Minutely   (daily-min — docs/02 §5)
//   * level_count == 5, split_parts == 7 (docs/02 §3)
//   * placement depth <= 5             (docs/02 §2)

use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

pub mod error;
pub mod state;

use error::ConexpleProtocolError;
use state::*;

#[program]
pub mod conexple_protocol {
    use super::*;

    /// Initialize a network's immutable rule snapshot.
    ///
    /// Idempotency: the ProtocolConfig PDA is keyed by `network_id`, so each
    /// network has exactly one config. Re-init attempts hit `init` constraint
    /// failure.
    pub fn initialize_rules(
        ctx: Context<InitializeRules>,
        params: InitializeRulesParams,
    ) -> Result<()> {
        require!(
            params.margin_bps_max <= MAX_MARGIN_BPS,
            ConexpleProtocolError::MarginCapExceeded
        );
        require!(
            params.cycle.is_supported(),
            ConexpleProtocolError::CycleTooFast
        );
        require!(
            params.multiplier >= 1 && params.multiplier <= 1000,
            ConexpleProtocolError::MultiplierOutOfRange
        );
        require!(
            params.pool_split_bps <= 10_000,
            ConexpleProtocolError::PoolSplitOutOfRange
        );

        let cfg = &mut ctx.accounts.config;
        cfg.bump = ctx.bumps.config;
        cfg.network_id = params.network_id;
        cfg.admin = ctx.accounts.admin.key();
        cfg.level_count = LEVEL_COUNT;
        cfg.split_parts = SPLIT_PARTS;
        cfg.margin_bps_max = params.margin_bps_max;
        cfg.multiplier = params.multiplier;
        cfg.cycle = params.cycle;
        cfg.pool_split_bps = params.pool_split_bps;
        cfg.infinity_min_spend_multiple = params.infinity_min_spend_multiple;
        cfg.infinity_min_consecutive_cycles = params.infinity_min_consecutive_cycles;
        cfg.created_at = Clock::get()?.unix_timestamp;

        emit!(RulesInitialized {
            network_id: cfg.network_id,
            admin: cfg.admin,
            margin_bps_max: cfg.margin_bps_max,
            cycle: cfg.cycle,
        });

        Ok(())
    }

    /// Verify a proposed placement conforms to protocol rules.
    ///
    /// This is a pure check — it does not touch chain state. Used by the
    /// off-chain placement engine to confirm a candidate parent before
    /// submitting `place_member` to `conexple_network`.
    pub fn verify_placement(
        ctx: Context<VerifyPlacement>,
        proposed_depth: u8,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(
            proposed_depth <= cfg.level_count,
            ConexpleProtocolError::PlacementTooDeep
        );
        Ok(())
    }
}

// ── Account contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(params: InitializeRulesParams)]
pub struct InitializeRules<'info> {
    #[account(
        init,
        payer = admin,
        space = ProtocolConfig::SIZE,
        seeds = [b"config", &params.network_id.to_le_bytes()],
        bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyPlacement<'info> {
    #[account(
        seeds = [b"config", &config.network_id.to_le_bytes()],
        bump = config.bump,
    )]
    pub config: Account<'info, ProtocolConfig>,
}

// ── Public params ──────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeRulesParams {
    pub network_id: u64,
    pub margin_bps_max: u16,
    pub multiplier: u32,
    pub cycle: SettlementCycle,
    pub pool_split_bps: u16,
    pub infinity_min_spend_multiple: u32,
    pub infinity_min_consecutive_cycles: u8,
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct RulesInitialized {
    pub network_id: u64,
    pub admin: Pubkey,
    pub margin_bps_max: u16,
    pub cycle: SettlementCycle,
}
