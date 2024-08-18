use crate::errors::ErrorCode;
use crate::events::Paused;
use crate::state::RewardsAccount;
use anchor_lang::prelude::*;

/// [rewards_distributor::unpaused] accounts.
#[derive(Accounts)]
pub struct UnPause<'info> {
    // current manager of the program.
    #[account(mut)]
    pub manager: Signer<'info>,

    /// The [RewardsAccount].
    #[account(mut, has_one = manager @ ErrorCode::Unauthorized)]
    pub rewards_account: Account<'info, RewardsAccount>,
}

pub fn unpause_handler(ctx: Context<UnPause>) -> Result<()> {
    let rewards_account = &mut ctx.accounts.rewards_account;
    require!(rewards_account.is_paused, ErrorCode::ShouldBePaused);

    rewards_account.is_paused = false;

    emit!(Paused { is_paused: false });

    Ok(())
}
