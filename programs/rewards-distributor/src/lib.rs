//! Zenith Rewards Distributor.
mod errors;
mod events;
mod instructions;
mod state;
mod utils;

use anchor_lang::prelude::*;
pub use instructions::*;

declare_id!("HUQgMMSpb47bbDfavp27CZ78cJyYfCWR3i1GG4KbBB4m");

#[program]
pub mod rewards_distributor {
    use super::*;

    /// Initilizes the program and sets the signer as `Admin`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize_handler(ctx)
    }

    /// Updates the `Admin` to `new_admin`.
    /// Can only be called by the current `Admin`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `new_admin` - Pubkey to set as the new program admin.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        update_admin_handler(ctx, new_admin)
    }

    // Sets the merkle root for the claiming process.
    /// Can only be called by the `Admin`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - Context for the instruction.
    /// * `bump` - Bump seed used for Program Derived Address (PDA) generation.
    /// * `root` - Root of the merkle tree.
    /// * `max_total_claim` - Maximum total amount that can be claimed.
    /// * `max_num_nodes` - Maximum number of nodes in the Merkle tree.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Provided Signer is not authorized to call this instruction.
    pub fn set_merkle_distributor(
        ctx: Context<NewDistributor>,
        bump: u8,
        root: [u8; 32],
        max_total_claim: u64,
        max_num_nodes: u64,
    ) -> Result<()> {
        set_merkle_distributor_handler(ctx, bump, root, max_total_claim, max_num_nodes)
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
    /// * `OwnerMismatch` - Provided `to` account is not the same as reciever's public key.
    /// * `DropAlreadyClaimed` - User has already claimed.
    /// * `InvalidProof` - Provided proof is invalid.
    /// * `ExceededMaxClaim` - User has exceeded allocated claim.
    /// * `ExceededMaxNumNodes` - Max number of nodes has been exceeded.
    pub fn claim(ctx: Context<Claim>, index: u64, amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        claim_handler(ctx, index, amount, proof)
    }
}
