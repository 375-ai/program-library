use crate::errors::ErrorCode;
use crate::events::EpochCreated;
use crate::state::{EpochAccount, RewardsAccount};
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

/// [rewards_distributor::add_epoch] accounts.
#[derive(Accounts)]
pub struct AddEpoch<'info> {
    /// The [RewardsAccount].
    #[account(
        mut,
        has_one = agent @ ErrorCode::Unauthorized,
    )]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The current [EpochAccount].
    #[account(
        init,
        seeds = [
            b"EpochAccount".as_ref(),
            rewards_account.key().as_ref(),
            (rewards_account.current_epoch_nr + 1).to_le_bytes().as_ref()
        ],
        bump,
        payer = agent,
        space = 8 + EpochAccount::INIT_SPACE
    )]
    pub current_epoch_account: Account<'info, EpochAccount>,

    /// The mint to distribute.
    pub mint: Account<'info, Mint>,

    /// current manager of the program.
    #[account(mut)]
    pub agent: Signer<'info>,

    /// The [System] program.
    pub system_program: Program<'info, System>,
}

/// set add epoch handler.
pub fn add_epoch_handler(ctx: Context<AddEpoch>, bump: u8, root: [u8; 32]) -> Result<()> {
    let rewards_account = &mut ctx.accounts.rewards_account;
    let current_epoch_account = &mut ctx.accounts.current_epoch_account;

    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    require!(
        rewards_account.current_approved_epoch == rewards_account.current_epoch_nr,
        ErrorCode::PreviousEpochIsNotApproved
    );

    // get current epoch number from rewards data account
    let current_epoch_nr = rewards_account.current_epoch_nr;

    rewards_account.current_epoch_nr = rewards_account.current_approved_epoch + 1;

    // set epoch data
    current_epoch_account.epoch_nr = current_epoch_nr + 1;
    current_epoch_account.is_approved = false;
    current_epoch_account.hash = root.clone();
    current_epoch_account.bump = bump;
    current_epoch_account.mint = ctx.accounts.mint.key();
    current_epoch_account.total_amount_claimed = 0;
    current_epoch_account.num_nodes_claimed = 0;

    // Get the current Unix timestamp.
    let timestamp = Clock::get()?.unix_timestamp;

    // Emit an event to signal that the Merkle root has been submitted.
    emit!(EpochCreated {
        epoch_nr: rewards_account.current_epoch_nr,
        hash: root,
        timestamp,
        agent: ctx.accounts.agent.key(),
        mint: ctx.accounts.mint.key(),
    });

    Ok(())
}
