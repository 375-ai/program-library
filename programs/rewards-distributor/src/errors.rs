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

    /// Error indicating that the maximum number of claimed nodes has been exceeded.
    #[msg("Exceeded maximum number of claimed nodes.")]
    ExceededMaxNumNodes,

    /// Error indicating that the token account owner does not match the intended owner.
    #[msg("Token account owner did not match intended owner")]
    OwnerMismatch,

    /// Error indicating that the reward drop has already been claimed.
    #[msg("Drop already claimed")]
    DropAlreadyClaimed,

    /// Error indicating that the provided proof is invalid.
    #[msg("Invalid Proof")]
    InvalidProof,

    /// Error indicating that the claim exceeds the maximum allowable amount.
    #[msg("Exceeded Max Claim")]
    ExceededMaxClaim,
}
