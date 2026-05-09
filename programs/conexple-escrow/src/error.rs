use anchor_lang::prelude::*;

#[error_code]
pub enum ConexpleEscrowError {
    #[msg("amount must be > 0")]
    InvalidAmount,
    #[msg("merchant key does not match merchant_escrow.merchant")]
    WrongMerchant,
    #[msg("oracle authority not recognised")]
    UnauthorizedOracle,
    #[msg("settle_at must be in the future")]
    SettleInPast,
    #[msg("pending commission is not in Pending status")]
    NotPending,
    #[msg("hold period has not elapsed (now < settle_at)")]
    HoldNotElapsed,
    #[msg("cannot void a pending commission past its settle_at")]
    PastSettle,
    #[msg("caller is not authorised to void this purchase")]
    UnauthorizedVoid,
    #[msg("pool_split_bps must be between 0 and 10000 inclusive")]
    PoolSplitOutOfRange,
}
