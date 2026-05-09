use anchor_lang::prelude::*;

#[error_code]
pub enum ConexpleOracleError {
    #[msg("admin authority does not match registry admin")]
    Unauthorized,
    #[msg("registry already at max signer capacity")]
    TooManySigners,
    #[msg("oracle pubkey already registered")]
    AlreadyRegistered,
    #[msg("oracle pubkey is not registered")]
    NotRegistered,
    #[msg("signer is not in the registry")]
    SignerNotRegistered,
}
