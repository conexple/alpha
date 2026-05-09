use anchor_lang::prelude::*;

#[error_code]
pub enum ConexpleProtocolError {
    #[msg("margin_bps exceeds the protocol-wide 50% cap")]
    MarginCapExceeded,
    #[msg("settlement cycle is faster than the daily minimum")]
    CycleTooFast,
    #[msg("multiplier must be between 1 and 1000 inclusive")]
    MultiplierOutOfRange,
    #[msg("pool_split_bps must be between 0 and 10000 inclusive")]
    PoolSplitOutOfRange,
    #[msg("placement depth exceeds the configured level_count")]
    PlacementTooDeep,
}
