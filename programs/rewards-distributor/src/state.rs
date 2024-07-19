use anchor_lang::{prelude::*, solana_program::pubkey::PUBKEY_BYTES};

/// Data account to store the `Manager` of the program.
/// This account holds the public key of the current manager who has the authority to manage the program.
/// The `manager` field is used to identify and authenticate the manager for performing administrative tasks.
#[account]
#[derive(InitSpace)]
pub struct RewardsAccount {
    /// Pubkey of the `Manager` of the program.
    pub manager: Pubkey,

    /// Pubkey fo the `ProposedManager` of the program.
    pub proposed_manager: Pubkey,

    /// Pubkey of the agent associated with the program.
    pub agent: Pubkey,

    /// The current epoch number.
    pub current_epoch_nr: u64,

    /// The currently approved epoch number.
    pub current_approved_epoch: u64,

    /// The length of each epoch.
    pub epoch_length: u64,

    /// Indicates if the program is paused.
    pub is_paused: bool,
}

/// State for the account which distributes tokens.
#[account]
#[derive(Default)]
pub struct RewardsDistributor {
    /// Base key used to generate the PDA.
    pub base: Pubkey,
    /// Bump seed.
    pub bump: u8,

    /// The 256-bit merkle root.
    pub root: [u8; 32],

    /// [Mint] of the token to be distributed.
    pub mint: Pubkey,

    /// Total amount of tokens that have been claimed.
    pub total_amount_claimed: u64,

    /// Number of nodes that have been claimed.
    pub num_nodes_claimed: u64,
}

impl RewardsDistributor {
    pub const LEN: usize = PUBKEY_BYTES + 1 + 32 + PUBKEY_BYTES + 8 * 4;
}

#[account]
#[derive(Default)]
pub struct ClaimStatus {
    /// If true, the tokens have been claimed.
    pub is_claimed: bool,

    /// Authority that claimed the tokens.
    pub receiver: Pubkey,

    /// When the tokens were claimed.
    pub claimed_at: i64,

    /// Amount of tokens claimed.
    pub amount: u64,
}

impl ClaimStatus {
    pub const LEN: usize = 1 + PUBKEY_BYTES + 8 + 8;
}

/// State for the epoch account.
#[account]
#[derive(InitSpace)]
pub struct EpochAccount {
    /// The epoch number.
    pub epoch_nr: u64,

    /// Indicates if the epoch is approved.
    pub is_approved: bool,

    /// Hash of the epoch.
    pub hash: [u8; 32],
}
