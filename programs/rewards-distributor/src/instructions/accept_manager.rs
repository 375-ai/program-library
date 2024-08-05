use crate::errors::ErrorCode;
use crate::events::ManagerUpdated;
use crate::state::RewardsAccount;
use anchor_lang::prelude::*;

/// [rewards_distributor::accpet_manager] accounts.
#[derive(Accounts)]
pub struct AcceptManager<'info> {
    #[account(mut)]
    proposed_manager: Signer<'info>,

    /// The [RewardsAccount].
    #[account(mut, has_one = proposed_manager @ ErrorCode::Unauthorized)]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [System] program.
    pub system_program: Program<'info, System>,
}

/// set accept manager handler.
pub fn accept_manager_handler(ctx: Context<AcceptManager>) -> Result<()> {
    let rewards_account = &mut ctx.accounts.rewards_account;
    let new_manager = *&ctx.accounts.proposed_manager.key();

    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    rewards_account.manager = new_manager;
    rewards_account.proposed_manager = Pubkey::new_from_array([0; 32]);

    emit!(ManagerUpdated { new_manager });

    Ok(())
}
