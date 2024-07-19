use anchor_lang::prelude::*;

/// Event emitted when the program is initialized.
///
/// This event contains the public key of the Manager who initialized the program.
#[event]
pub struct Initialized {
    /// Public key of the Manager who initialized the program.
    pub manager: Pubkey,

    /// Public key of the Agent set by the Manager
    pub agent: Pubkey,

    /// Current epoch number
    pub current_epoch_nr: u64,
}

/// Event emitted when the Manager is updated.
///
/// This event contains the public key of the new Manager.
#[event]
pub struct ManagerUpdated {
    /// Public key of the new Manager.
    pub new_manager: Pubkey,
}

/// Event emitted when a Proposed manager is set.
///
/// This event contains the public key of the Proposed manager.
#[event]
pub struct NewProposedManager {
    /// Public key of the Proposed manager.
    pub proposed_manager: Pubkey,
}

/// Event emitted when a new Merkle root hash is submitted.
///
/// This event contains the new root hash, the maximum total claimable amount,
/// the maximum number of nodes in the Merkle tree, and the timestamp of submission.
#[event]
pub struct EpochCreated {
    pub epoch_nr: u64,
    /// New root hash of the Merkle tree.
    pub hash: [u8; 32],
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

/// Event emitted when the agent is changed.
///
/// This event contains the pubkey of the new_agent.
#[event]
pub struct AgentChanged {
    pub new_agent: Pubkey,
}

/// Event emitted when the program is paused.
///
/// This event contains a boolean that represents the pause state of the program.
#[event]
pub struct Paused {
    pub is_paused: bool,
}

/// Event emitted when an epoch is corrected.
///
/// This event contains the corrected root hash and the epoch number of the corrected epoch.
#[event]
pub struct EpochCorrected {
    pub root: [u8; 32],
    pub epoch_nr: u64,
}

/// Event emitted when an epoch is aproved.
///
/// This event contains the epoch number of the approved epoch.
#[event]
pub struct EpochApproved {
    pub epoch_nr: u64,
}
