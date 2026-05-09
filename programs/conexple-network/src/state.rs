use anchor_lang::prelude::*;

pub const MAX_PLACEMENT_DEPTH: u8 = 5;

#[account]
pub struct NetworkState {
    pub bump: u8,
    pub network_id: u64,
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub cycle_seconds: i64,
    pub cycle_index: u64,
    pub cycle_started_at: i64,
    pub member_count: u64,
}

impl NetworkState {
    pub const SIZE: usize = 8 + 1 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 32; // padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PositionStatus {
    Active = 0,
    Expired = 1,
}

#[account]
pub struct Position {
    pub bump: u8,
    pub network_id: u64,
    pub wallet: Pubkey,
    pub parent: Option<Pubkey>,
    pub depth: u8,
    pub status: PositionStatus,
    pub cumulative_earned: u64,
    pub earnings_cap: u64,
    pub last_purchase_round: u64,
    pub extension_locked: bool,
    pub joined_at: i64,
    pub expired_at: Option<i64>,
}

impl Position {
    // 8 disc + 1 bump + 8 + 32 + (1 + 32) + 1 + 1 + 8 + 8 + 8 + 1 + 8 + (1 + 8) + 64 padding
    pub const SIZE: usize = 8 + 1 + 8 + 32 + (1 + 32) + 1 + 1 + 8 + 8 + 8 + 1 + 8 + (1 + 8) + 64;
}

#[account]
pub struct PurchaseRecord {
    pub bump: u8,
    pub network_id: u64,
    pub wallet: Pubkey,
    pub round: u64,
    pub total_amount: u64,
    pub purchase_count: u32,
    pub last_at: i64,
}

impl PurchaseRecord {
    pub const SIZE: usize = 8 + 1 + 8 + 32 + 8 + 8 + 4 + 8 + 32; // padding
}
