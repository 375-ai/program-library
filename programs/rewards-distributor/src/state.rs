use anchor_lang::{prelude::*, solana_program::pubkey::PUBKEY_BYTES};

/// Data account to store the `Admin` of the program.
/// This account holds the public key of the current admin who has the authority to manage the program.
/// The `admin` field is used to identify and authenticate the admin for performing administrative tasks.
#[account]
#[derive(InitSpace)]
pub struct RewardsAccount {
    /// Pubkey of the `Admin` of the program.
    pub admin: Pubkey,
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
    /// Maximum number of tokens that can ever be claimed from this [RewardsDistributor].
    pub max_total_claim: u64,
    /// Maximum number of nodes that can ever be claimed from this [RewardsDistributor].
    pub max_num_nodes: u64,
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
