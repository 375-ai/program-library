//! 375ai Rewards Distributor.
mod errors;
mod events;
mod instructions;
mod state;
mod utils;

use anchor_lang::prelude::*;
pub use instructions::*;

declare_id!("2dUMVSQkKUu1YTUrt5xW1w1A27HmnnsoDhn1QKrYPaCS");

#[program]
pub mod rewards_distributor {
    use super::*;

    /// Initializes the program and sets the signer as `Manager`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `agent` - The address of the agent user.
    pub fn initialize(ctx: Context<Initialize>, agent: Pubkey) -> Result<()> {
        initialize_handler(ctx, agent)
    }

    /// Propose a Pubkey to be the `Manager`.
    /// Can only be called by the current `Manager`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `proposed_manager` - Pubkey to set as the proposed manager.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    /// * `ShouldNotBePaused` - Thrown if the protocol is paused.
    pub fn propose_manager(ctx: Context<ProposeManager>, proposed_manager: Pubkey) -> Result<()> {
        propose_manager_handler(ctx, proposed_manager)
    }

    /// Accepts the proposed Manager role.
    /// Can only be called by the Proposed Manager.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    /// * `ShouldNotBePaused` - Thrown if the protocol is paused.
    pub fn accept_manager(ctx: Context<AcceptManager>) -> Result<()> {
        accept_manager_handler(ctx)
    }

    /// Change the current agent.
    /// Can only be called by the Manager.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `new_agent` - Pubkey to set as the agent.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    /// * `ShouldNotBePaused` - Thrown if the protocol is paused.
    pub fn change_agent(ctx: Context<ChangeAgent>, new_agent: Pubkey) -> Result<()> {
        change_agent_handler(ctx, new_agent)
    }

    /// Sets the merkle root for the claiming process.
    /// Can only be called by the `Manager`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `bump` - Bump seed used for Program Derived Address (PDA) generation.
    /// * `root` - Root of the merkle tree.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    /// * `ShouldNotBePaused` - Thrown if the protocol is paused.
    /// * `PreviousEpochIsNotApproved` - Thrown if the previous epoch is not approved.
    pub fn add_epoch(ctx: Context<AddEpoch>, bump: u8, root: [u8; 32]) -> Result<()> {
        add_epoch_handler(ctx, bump, root)
    }

    /// Corrects the merkle root for a specific epoch and the mint if needed.
    /// Can only be called by the `Agent` only while the epoch is not approved.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `root` - Corrected root of the merkle tree.
    /// * `epoch_nr` - The epoch number to correct.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    /// * `ShouldNotBePaused` - Thrown if the protocol is paused.
    /// * `EpochShouldNotBeApproved` - Thrown if the epoch is approved.
    pub fn correct_epoch(ctx: Context<CorrectEpoch>, epoch_nr: u64, root: [u8; 32]) -> Result<()> {
        correct_epoch_handler(ctx, epoch_nr, root)
    }

    /// Approves the epoch for distribution.
    /// Can only be called by the `Manager`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `epoch_nr` - The epoch number to approve.
    /// * `amount` - The amount to be approved for distribution.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    /// * `ShouldNotBePaused` - Thrown if the protocol is paused.
    pub fn approve_epoch(ctx: Context<ApproveEpoch>, epoch_nr: u64, amount: u64) -> Result<()> {
        approve_epoch_handler(ctx, epoch_nr, amount)
    }

    /// Sends rewards to the signer if they have an allocation in the submitted Merkle tree.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `index` - Index of the claim in the Merkle tree.
    /// * `amount` - Amount to be claimed by the user.
    /// * `proof` - Merkle proof for verifying the claim, which is a vector of 32-byte arrays.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    /// * `ShouldNotBePaused` - Thrown if the protocol is paused.
    /// * `OwnerMismatch` - Provided `to` account is not the same as reciever's public key.
    /// * `DropAlreadyClaimed` - User has already claimed.
    /// * `InvalidProof` - Provided proof is invalid.
    pub fn claim(
        ctx: Context<Claim>,
        index: u64,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        claim_handler(ctx, index, amount, proof)
    }

    /// Pauses the program.
    /// Can only be called by the `Manager`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    ///
    /// # Errors
    ///
    /// * `ShouldNotBePaused` - Thrown if the protocol is already paused.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        pause_handler(ctx)
    }

    /// Unpauses the program.
    /// Can only be called by the `Manager`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    ///
    /// # Errors
    ///
    /// * `ShouldBePaused` - Thrown if the protocol is already unpaused.
    pub fn unpause(ctx: Context<UnPause>) -> Result<()> {
        unpause_handler(ctx)
    }
}
