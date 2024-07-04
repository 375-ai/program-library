use crate::errors::ErrorCode;
use crate::events::RootHashSubmitted;
use crate::state::{RewardsAccount, RewardsDistributor};
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

/// [rewards_distributor::set_merkle_distributor] accounts.
#[derive(Accounts)]
pub struct NewDistributor<'info> {
    /// Base key of the distributor.
    pub base: Signer<'info>,

    /// [RewardsDistributor].
    #[account(
        init,
        seeds = [
            b"RewardsDistributor".as_ref(),
            base.key().to_bytes().as_ref()
        ],
        bump,
        space = 8 + RewardsDistributor::LEN,
        payer = admin
    )]
    pub distributor: Account<'info, RewardsDistributor>,

    /// The [RewardsAccount].
    #[account(
        mut,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The mint to distribute.
    pub mint: Account<'info, Mint>,

    /// current admin of the program.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The [System] program.
    pub system_program: Program<'info, System>,
}

/// set merkle distributor handler.
pub fn set_merkle_distributor_handler(
    ctx: Context<NewDistributor>,
    bump: u8,
    root: [u8; 32],
    max_total_claim: u64,
    max_num_nodes: u64,
) -> Result<()> {
    // Get a mutable reference to the distributor account from the context.
    let distributor = &mut ctx.accounts.distributor;

    // configure the distributor account with provided parameters and initialize claim tracking.
    distributor.base = ctx.accounts.base.key();
    distributor.bump = bump;

    distributor.root = root;
    distributor.mint = ctx.accounts.mint.key();

    distributor.max_total_claim = max_total_claim;
    distributor.max_num_nodes = max_num_nodes;
    distributor.total_amount_claimed = 0;
    distributor.num_nodes_claimed = 0;

    // Get the current Unix timestamp.
    let timestamp = Clock::get()?.unix_timestamp;

    // Emit an event to signal that the Merkle root has been submitted.
    emit!(RootHashSubmitted {
        hash: root,
        max_total_claim,
        max_num_nodes,
        timestamp
    });

    Ok(())
}
