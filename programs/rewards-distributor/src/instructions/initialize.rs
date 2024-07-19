use crate::events::Initialized;
use crate::state::RewardsAccount;
use anchor_lang::prelude::*;

/// [rewards_distributor::initialize] accounts.
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// current admin of the program.
    #[account(mut)]
    pub manager: Signer<'info>,

    /// The [RewardsAccount].
    #[account(
        init,
        payer = manager,
        space = 8 + RewardsAccount::INIT_SPACE)
    ]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [System] program.
    pub system_program: Program<'info, System>,
}

/// initialize handler.
pub fn initialize_handler(ctx: Context<Initialize>, agent: Pubkey, epoch_lenth: u64) -> Result<()> {
    // Get a mutable reference to the rewards account from the context.
    let rewards_account = &mut ctx.accounts.rewards_account;

    // Sets signer as the `Admin`.
    rewards_account.manager = ctx.accounts.manager.key();
    rewards_account.agent = agent;
    rewards_account.current_epoch_nr = 0;
    rewards_account.epoch_length = epoch_lenth;

    // Emit an event to signal that the program has been initialized.
    emit!(Initialized {
        manager: ctx.accounts.manager.key(),
        agent,
        current_epoch_nr: 0
    });

    Ok(())
}
