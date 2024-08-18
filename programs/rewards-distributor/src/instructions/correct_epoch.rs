use crate::{
    errors::ErrorCode,
    events::EpochCorrected,
    state::{EpochAccount, RewardsAccount},
};
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

/// [rewards_distributor::correct_epoch] accounts.
#[derive(Accounts)]
#[instruction( epoch_nr: u64)]
pub struct CorrectEpoch<'info> {
    /// The [RewardsAccount]
    #[account(mut, has_one = agent @ ErrorCode::Unauthorized)]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [EpochAccount]
    #[account(mut,
        seeds = [
         b"EpochAccount".as_ref(),
         rewards_account.key().as_ref(),
         epoch_nr.to_le_bytes().as_ref()
    ],
    bump
    )]
    pub epoch_account: Account<'info, EpochAccount>,

    /// The mint to distribute.
    pub mint: Account<'info, Mint>,

    /// current manager of the program.
    pub agent: Signer<'info>,
}

pub fn correct_epoch_handler(
    ctx: Context<CorrectEpoch>,
    epoch_nr: u64,
    root: [u8; 32],
) -> Result<()> {
    let rewards_account = &mut ctx.accounts.rewards_account;
    let epoch_account = &mut ctx.accounts.epoch_account;

    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    require!(
        !epoch_account.is_approved,
        ErrorCode::EpochShouldNotBeApproved
    );

    epoch_account.hash = root;
    epoch_account.mint = ctx.accounts.mint.key();

    emit!(EpochCorrected {
        root,
        epoch_nr,
        mint: ctx.accounts.mint.key(),
    });

    Ok(())
}
