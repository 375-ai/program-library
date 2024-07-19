use crate::errors::ErrorCode;
use crate::events::AgentChanged;
use crate::state::RewardsAccount;
use anchor_lang::prelude::*;

/// [rewards_distributor::change_agent] accounts.
#[derive(Accounts)]
pub struct ChangeAgent<'info> {
    // current manager of the program .
    #[account(mut)]
    manager: Signer<'info>,

    /// The [RewardsAccount].
    #[account(mut, has_one = manager @ErrorCode::Unauthorized)]
    rewards_account: Account<'info, RewardsAccount>,
}

pub fn change_agent_handler(ctx: Context<ChangeAgent>, new_agent: Pubkey) -> Result<()> {
    let rewards_account = &mut ctx.accounts.rewards_account;
    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    rewards_account.agent = new_agent;

    emit!(AgentChanged { new_agent });

    Ok(())
}
