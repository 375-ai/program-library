use crate::errors::ErrorCode;
use crate::events::Paused;
use crate::state::RewardsAccount;
use anchor_lang::prelude::*;

/// [rewards_distributor::pause] accounts.
#[derive(Accounts)]
pub struct Pause<'info> {
    // current manager of the program.
    #[account(mut)]
    pub manager: Signer<'info>,

    /// The [RewardsAccount].
    #[account(mut, has_one = manager @ ErrorCode::Unauthorized,)]
    pub rewards_account: Account<'info, RewardsAccount>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let rewards_account = &mut ctx.accounts.rewards_account;
    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    rewards_account.is_paused = true;

    emit!(Paused { is_paused: true });

    Ok(())
}
