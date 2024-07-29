use crate::errors::ErrorCode;
use crate::events::EpochCreated;
use crate::state::{EpochAccount, RewardsAccount, RewardsDistributor};
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

/// [rewards_distributor::add_epoch] accounts.
#[derive(Accounts)]
pub struct AddEpoch<'info> {
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
        payer = agent
    )]
    pub distributor: Account<'info, RewardsDistributor>,

    /// The [RewardsAccount].
    #[account(
        mut,
        has_one = agent @ ErrorCode::Unauthorized,
    )]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [EpochAccount].
    #[account(
        init_if_needed,
        seeds = [
            b"EpochAccount".as_ref(),
            (rewards_account.current_epoch_nr).to_le_bytes().as_ref()
        ],
        bump,
        payer = agent,
        space = 8 + RewardsAccount::INIT_SPACE
    )]
    pub previous_epoch_account: Account<'info, EpochAccount>,

    /// The [EpochAccount].
    #[account(
        init,
        seeds = [
            b"EpochAccount".as_ref(),
            (rewards_account.current_epoch_nr + 1).to_le_bytes().as_ref()
        ],
        bump,
        payer = agent,
        space = 8 + RewardsAccount::INIT_SPACE
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
    let previous_epoch_account = &mut ctx.accounts.previous_epoch_account;
    let current_epoch_account = &mut ctx.accounts.current_epoch_account;

    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    // go over the first iteration
    if !rewards_account.current_epoch_nr == 0 {
        require!(
            !previous_epoch_account.is_approved,
            ErrorCode::PreviousEpochIsNotApproved
        );
    }

    // get current epoch number from rewards data account
    let current_epoch_nr = rewards_account.current_epoch_nr;

    // set epoch data
    current_epoch_account.epoch_nr = current_epoch_nr + 1;
    current_epoch_account.is_approved = false;
    current_epoch_account.hash = root.clone();

    // current_epoch_nr = currently_approved_epoch_nr + 1
    rewards_account.current_epoch_nr = rewards_account.current_approved_epoch + 1;

    // Get a mutable reference to the distributor account from the context.
    let distributor = &mut ctx.accounts.distributor;

    // configure the distributor account with provided parameters and initialize claim tracking.
    distributor.base = ctx.accounts.base.key();
    distributor.bump = bump;

    distributor.mint = ctx.accounts.mint.key();

    distributor.total_amount_claimed = 0;
    distributor.num_nodes_claimed = 0;

    // Get the current Unix timestamp.
    let timestamp = Clock::get()?.unix_timestamp;

    // Emit an event to signal that the Merkle root has been submitted.
    emit!(EpochCreated {
        epoch_nr: rewards_account.current_epoch_nr,
        hash: root,
        timestamp
    });

    Ok(())
}
