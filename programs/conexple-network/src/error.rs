use anchor_lang::prelude::*;

#[error_code]
pub enum ConexpleNetworkError {
    #[msg("settlement cycle is faster than the daily minimum (24h)")]
    CycleTooFast,
    #[msg("cycle has not yet elapsed")]
    CycleNotElapsed,
    #[msg("initial spend must be > 0")]
    InvalidInitialSpend,
    #[msg("multiplier must be > 0")]
    InvalidMultiplier,
    #[msg("placement signer is not the registered oracle")]
    UnauthorizedPlacementSigner,
    #[msg("position is already placed under a parent")]
    AlreadyPlaced,
    #[msg("parent position is not active")]
    ParentNotActive,
    #[msg("placement depth exceeds MAX_PLACEMENT_DEPTH")]
    PlacementTooDeep,
    #[msg("position is not active")]
    PositionNotActive,
    #[msg("oracle authority does not match network.oracle")]
    UnauthorizedOracle,
    #[msg("authority does not match network.admin")]
    UnauthorizedAdmin,
    #[msg("purchase amount must be > 0")]
    InvalidPurchaseAmount,
    #[msg("earnings amount must be > 0")]
    InvalidEarningsAmount,
    #[msg("round does not match current cycle_index")]
    RoundMismatch,
    #[msg("expiry not eligible: position has been active in last 2 cycles")]
    ExpiryNotEligible,
    #[msg("parent_position belongs to a different network")]
    WrongNetwork,
}
