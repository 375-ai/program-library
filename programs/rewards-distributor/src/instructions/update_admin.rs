use crate::errors::ErrorCode;
use crate::events::AdminUpdated;
use crate::state::RewardsAccount;
use anchor_lang::prelude::*;

/// [rewards_distributor::update_admin] accounts.
#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    /// current admin of the program.
    #[account(mut)]
    admin: Signer<'info>,

    /// The [RewardsAccount].
    #[account(mut, has_one = admin @ ErrorCode::Unauthorized)]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [System] program.
    pub system_program: Program<'info, System>,
}

/// update_admin handler
pub fn update_admin_handler(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
    // Get a mutable reference to the rewards account from the context.
    let rewards_account = &mut ctx.accounts.rewards_account;

    // Update the admin field of the rewards account to the new admin.
    rewards_account.admin = new_admin;

    // Emit an event to signal that the admin has been updated.
    emit!(AdminUpdated { new_admin });

    Ok(())
}
