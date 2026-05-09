use anchor_lang::prelude::*;

/// Protocol-mandated constants (cannot be tuned per network).
pub const LEVEL_COUNT: u8 = 5;
pub const SPLIT_PARTS: u8 = 7;
pub const MAX_MARGIN_BPS: u16 = 5_000; // 50% — docs/02 §3

/// Settlement cycle. Sub-daily cycles are forbidden (`is_supported`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum SettlementCycle {
    Daily = 0,
    Weekly = 1,
    Monthly = 2,
    Quarterly = 3,
    Yearly = 4,
}

impl SettlementCycle {
    /// Daily-min rule (docs/02 §5).
    pub fn is_supported(&self) -> bool {
        matches!(
            self,
            SettlementCycle::Daily
                | SettlementCycle::Weekly
                | SettlementCycle::Monthly
                | SettlementCycle::Quarterly
                | SettlementCycle::Yearly,
        )
    }

    /// Hold duration in seconds — anchored to cycle length (docs/03 §2).
    pub fn hold_seconds(&self) -> i64 {
        match self {
            SettlementCycle::Daily => 24 * 60 * 60,
            SettlementCycle::Weekly => 7 * 24 * 60 * 60,
            SettlementCycle::Monthly => 30 * 24 * 60 * 60,
            SettlementCycle::Quarterly => 90 * 24 * 60 * 60,
            SettlementCycle::Yearly => 365 * 24 * 60 * 60,
        }
    }
}

#[account]
pub struct ProtocolConfig {
    pub bump: u8,
    pub network_id: u64,
    pub admin: Pubkey,

    // Protocol-mandated (informational; not user-tunable):
    pub level_count: u8,  // = LEVEL_COUNT (5)
    pub split_parts: u8,  // = SPLIT_PARTS (7)

    // Operator-tunable within hard caps:
    pub margin_bps_max: u16,                  // ≤ MAX_MARGIN_BPS (5_000)
    pub multiplier: u32,                      // 1..=1000 (cap = spend × multiplier)
    pub cycle: SettlementCycle,
    pub pool_split_bps: u16,                  // 0..=10_000, social vs operator slice of pool
    pub infinity_min_spend_multiple: u32,     // ≥ N× buyer's purchase
    pub infinity_min_consecutive_cycles: u8,  // ≥ N consecutive active cycles

    pub created_at: i64,
}

impl ProtocolConfig {
    // 8 disc + 1 + 8 + 32 + 1 + 1 + 2 + 4 + 1 + 2 + 4 + 1 + 8 + 64 padding
    pub const SIZE: usize = 8 + 1 + 8 + 32 + 1 + 1 + 2 + 4 + 1 + 2 + 4 + 1 + 8 + 64;
}
