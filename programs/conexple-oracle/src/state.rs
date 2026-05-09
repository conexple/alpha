use anchor_lang::prelude::*;

#[account]
pub struct OracleRegistry {
    pub bump: u8,
    pub network_id: u64,
    pub admin: Pubkey,
    pub signers: Vec<Pubkey>,
}

impl OracleRegistry {
    pub const MAX_SIGNERS: usize = 4;
    // 8 disc + 1 bump + 8 + 32 + 4 vec_len + (32 * MAX_SIGNERS) + 32 padding
    pub const SIZE: usize = 8 + 1 + 8 + 32 + 4 + (32 * Self::MAX_SIGNERS) + 32;
}
