use anchor_lang::prelude::*;

/// Enumeration of error codes used in the program.
///
/// Each variant represents a specific error that can occur during the program's execution.
#[error_code]
#[derive(Eq, PartialEq)]
pub enum ErrorCode {
    /// Error indicating that the signer is not authorized to perform the action.
    #[msg("Unauthorized signer")]
    Unauthorized,

    /// Error indicating that the token account owner does not match the intended owner.
    #[msg("Token account owner did not match intended owner")]
    OwnerMismatch,

    /// Error indicating that the reward drop has already been claimed.
    #[msg("Drop already claimed")]
    DropAlreadyClaimed,

    /// Error indicating that the provided merkle tree proof is invalid.
    #[msg("Invalid proof")]
    InvalidProof,

    /// Error indicating that the operation cannot be performed because the program is currently paused.
    #[msg("Operation not allowed: Program is currently paused.")]
    ShouldNotBePaused,

    /// Error indicating that the operation requires the program to be paused.
    #[msg("Operation requires the program to be paused.")]
    ShouldBePaused,

    /// Error indicating that the operation cannot be performed because the epoch is already approved.
    #[msg("Operation not allowed: Epoch is already approved.")]
    EpochShouldNotBeApproved,

    /// Error indicating that the operation cannot be performed because the epoch is not approved.
    #[msg("Operation not allowed: Epoch is not approved.")]
    EpochShouldBeApproved,

    /// Error indicating that the operation cannot be performed because the previous epoch is not approved.
    #[msg("Operation not allowed: Previous epoch is not approved.")]
    PreviousEpochIsNotApproved,

    /// Error indicating that the operation cannot be performed due to an invalid epoch number.
    #[msg("Operation not allowed: Invalid epoch number.")]
    InvalidEpochNr,

    ///Error indicating that the operation cannot be performed due to an invalid mint account.
    #[msg("Operation not allowed: Invalid mint account.")]
    InvalidMintAccount,
}
