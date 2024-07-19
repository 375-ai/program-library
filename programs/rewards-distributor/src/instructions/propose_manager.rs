use crate::errors::ErrorCode;
use crate::events::NewProposedManager;
use crate::state::RewardsAccount;
use anchor_lang::prelude::*;

/// [rewards_distributor::propose_manager] accounts.
#[derive(Accounts)]
pub struct ProposeManager<'info> {
    /// current admin of the program.
    #[account(mut)]
    manager: Signer<'info>,

    /// The [RewardsAccount].
    #[account(mut, has_one = manager @ ErrorCode::Unauthorized)]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [System] program.
    pub system_program: Program<'info, System>,
}

/// update_admin handler
pub fn propose_manager_handler(
    ctx: Context<ProposeManager>,
    proposed_manager: Pubkey,
) -> Result<()> {
    // Get a mutable reference to the rewards account from the context.
    let rewards_account = &mut ctx.accounts.rewards_account;

    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    // Update the admin field of the rewards account to the new admin.
    rewards_account.proposed_manager = proposed_manager;

    // Emit an event to signal that the admin has been updated.
    emit!(NewProposedManager { proposed_manager });

    Ok(())
}
