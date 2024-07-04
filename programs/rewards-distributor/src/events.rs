use anchor_lang::prelude::*;

/// Event emitted when the program is initialized.
///
/// This event contains the public key of the admin who initialized the program.
#[event]
pub struct Initialized {
    /// Public key of the admin who initialized the program.
    pub admin: Pubkey,
}

/// Event emitted when the admin is updated.
///
/// This event contains the public key of the new admin.
#[event]
pub struct AdminUpdated {
    /// Public key of the new admin.
    pub new_admin: Pubkey,
}

/// Event emitted when a new Merkle root hash is submitted.
///
/// This event contains the new root hash, the maximum total claimable amount,
/// the maximum number of nodes in the Merkle tree, and the timestamp of submission.
#[event]
pub struct RootHashSubmitted {
    /// New root hash of the Merkle tree.
    pub hash: [u8; 32],
    /// Maximum total amount that can be claimed.
    pub max_total_claim: u64,
    /// Maximum number of nodes in the Merkle tree.
    pub max_num_nodes: u64,
    /// Timestamp when the root hash was submitted.
    pub timestamp: i64,
}

/// Event emitted when rewards are claimed.
///
/// This event contains the index of the claim, the public key of the receiver,
/// and the amount of the reward claimed.
#[event]
pub struct ClaimedEvent {
    /// Index of the claim in the Merkle tree.
    pub index: u64,
    /// Public key of the receiver claiming the reward.
    pub receiver: Pubkey,
    /// Amount of the reward claimed.
    pub amount: u64,
}
