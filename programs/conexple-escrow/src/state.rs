use anchor_lang::prelude::*;

#[account]
pub struct PoolAccount {
    pub bump: u8,
    pub network_id: u64,
    pub admin: Pubkey,
    pub social_balance: u64,
    pub operator_balance: u64,
    pub pool_split_bps: u16,
}

impl PoolAccount {
    pub const SIZE: usize = 8 + 1 + 8 + 32 + 8 + 8 + 2 + 32; // padding
}

#[account]
pub struct MerchantEscrow {
    pub bump: u8,
    pub network_id: u64,
    pub merchant_id: u64,
    pub merchant: Pubkey,
    pub vault: Pubkey,
    pub deposited_total: u64,
    pub paid_out_total: u64,
    pub voided_total: u64,
}

impl MerchantEscrow {
    pub const SIZE: usize = 8 + 1 + 8 + 8 + 32 + 32 + 8 + 8 + 8 + 32; // padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PendingKind {
    LevelCommission = 0,
    InfinityOverride = 1,
    SocialPool = 2,
    OperatorPool = 3,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PendingStatus {
    Pending = 0,
    Settled = 1,
    Voided = 2,
}

#[account]
pub struct PendingCommission {
    pub bump: u8,
    pub network_id: u64,
    pub merchant_id: u64,
    pub purchase_id: u64,
    pub recipient: Pubkey,
    pub kind: PendingKind,
    pub slot: u8,                // 0..6 — disambiguates the 7 split slots within a purchase
    pub amount: u64,
    pub anchor_at: i64,
    pub settle_at: i64,
    pub status: PendingStatus,
}

impl PendingCommission {
    pub const SIZE: usize = 8 + 1 + 8 + 8 + 8 + 32 + 1 + 1 + 8 + 8 + 8 + 1 + 32; // padding
}
