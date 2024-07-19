# Rewards Distributor

This document provides detailed instructions on how to use the various functionalities of the Rewards Distributor program.

## Address

**2dUMVSQkKUu1YTUrt5xW1w1A27HmnnsoDhn1QKrYPaCS**

## Project Purpose

The purpose of the Rewards Distributor is to enable users to claim rewards based on the data they produce in the network during a two-week epoch. After the epoch concludes and is approved, users can claim their rewards, ensuring that contributions are fairly and efficiently rewarded.

## **ACL**

- **Agent**
   - This role can only submit the rewards distribution information for each epoch (merkle tree root hash)
- **Manager**
   - This role can:
      - Change the agent
      - Propose a new manager to take over the role (initiate the 2-step process for changing the manager)
      - Approve the rewards distribution information for an epoch

## **Data**

### **Global**

- `agent` - the address of the agent user
- `manager` - the address of the manager user
- `proposed_manager` - the address for the new manager
- `current_epoch_nr` - current epoch number
- `current_approved_epoch` - currently approved epoch number
- `epoch_length` - duration of the epoch expressed in number of blocks
- `is_paused` - indicates if the protocol is paused, which means that no operations can be executed

### **For each epoch**

- `epoch_nr` - epoch number (starts at 1)
- `is_approved` - indicates if the rewards distribution information has been approved by the manager
- `hash` - merkle tree root hash (rewards distribution information)

## **Instructions**

- **Initialize**
   - Bootstraps the smart contract and stores all the parameters for it:
      - `agent`
      - `manager` (set to the address of the deployer)
      - `current_epoch_nr` (set to `0`)
      - `currently_approved_epoch_nr` (set to `0`)
      - `epoch_length`
      - `is_paused` (set to `false`)
   - Emits event
- **Change agent**
   - Changes the address of the agent user.
   - **Preconditions**
      - The caller must be a manager
      - The `is_paused` flag must be `false`
   - Emits event
- **Propose manager**
   - Initiates the 2-step process for changing the manager. This will set the `proposed_manager` property.
   - **Preconditions**
      - The caller must be a manager
      - The `is_paused` flag must be `false`
   - Emits event
- **Accept manager**
   - Finalizes the 2-step process for changing the manager. This will set the `manager` to the value from the `proposed_manager` property, and will unset the `proposed_manager`.
   - **Preconditions**
      - The caller must be the proposed manager
      - The `is_paused` flag must be `false`
   - Emits event
- **Add epoch**
   - Creates a new epoch.
      - This operation will set the data for that epoch to:
         - `epoch_nr` = `currently_approved_epoch_nr` + `1`
         - `is_approved` = `false`
         - `hash` = instruction argument
      - This operation will also change the global data to:
         - `current_epoch_nr` = `currently_approved_epoch_nr` + `1`
   - **Preconditions**
      - The `is_approved` flag for each previous epoch must be `true`
      - The caller must be an agent
      - The `is_paused` flag must be `false`
   - Emits event
- **Correct epoch**
   - Updates the rewards distribution information (merkle tree root hash). This will only change the `hash` property for an epoch only while the epoch is not approved.
   - **Preconditions**
      - The `is_approved` flag for the epoch must be set to `false`
      - The caller must be an agent
      - The `is_paused` flag must be `false`
   - Emits event
- **Approve epoch**
   - Operations
      - Changes the `is_approved` flag for the epoch to `true`
      - Transfers tokens from the caller to the epoch ATA
   - ***Note***: After this operation the epoch is locked (no modifications can happen anymore) and users can start claiming the tokens from it.
   - **Preconditions**
      - The `is_approved` flag for the epoch must be `false`
      - The caller must be a manager
      - The `is_paused` flag must be `false`
   - Emits event
- **Claim rewards for epoch**
   - Transfers all the allocated tokens from the epoch ATA to the user.
   - **Precoditions**
      - Rewards allocation for this user must be present in the merkle tree
      - The `is_paused` flag must be `false`
   - Emits event
- **Pause**
   - Sets the `is_paused` flag to `true`
   - **Preconditions**
      - The `is_paused` flag is `false`
      - The caller must be a manager
   - Emits event
- **Unpause**
   - Sets the `is_paused` flag to `false`
   - **Preconditions**
      - The `is_paused` flag is `true`
      - The caller must be a manager
   - Emits event

## Rewards Distributor Program Diagram

[View PDF](https://github.com/375-ai/smart-contracts/blob/main/programs/rewards-distributor/diagrams/375ai%20smart%20contracts%20diagram.pdf)
