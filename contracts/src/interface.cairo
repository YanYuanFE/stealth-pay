use starknet::ContractAddress;
use starknet::ClassHash;

#[starknet::interface]
pub trait IPayrollFactory<TContractState> {
    fn register_company(
        ref self: TContractState,
        company_name: ByteArray,
        tongo_contract: ContractAddress,
        employer_pubkey_x: felt252,
        employer_pubkey_y: felt252,
    ) -> ContractAddress;

    fn delete_company(ref self: TContractState);

    /// Called by PayrollManager when registering an employee.
    /// Maps tongo_pubkey_hash → payroll contract address.
    fn bind_employee(ref self: TContractState, pubkey_hash: felt252);

    /// Unbind employee (called by PayrollManager on deactivation).
    fn unbind_employee(ref self: TContractState, pubkey_hash: felt252);

    /// Employee lookup: tongo pubkey hash → payroll contract address.
    fn get_employee_company(self: @TContractState, pubkey_hash: felt252) -> ContractAddress;

    fn get_company(self: @TContractState, employer: ContractAddress) -> ContractAddress;
    fn my_company(self: @TContractState) -> ContractAddress;
    fn is_registered_payroll(self: @TContractState, payroll: ContractAddress) -> bool;
    fn get_payroll_class_hash(self: @TContractState) -> ClassHash;
}

#[starknet::interface]
pub trait IPayrollManager<TContractState> {
    // Employee management — register with encrypted salary
    fn register_employee(
        ref self: TContractState,
        pubkey_x: felt252,
        pubkey_y: felt252,
        salary_cipher_0: u128,
        salary_cipher_1: u128,
        salary_cipher_2: u128,
        salary_cipher_3: u128,
        salary_nonce_low: u128,
        salary_nonce_high: u128,
    );
    fn deactivate_employee(ref self: TContractState, index: u32);
    fn reactivate_employee(ref self: TContractState, index: u32);

    // Update encrypted salary
    fn set_salary(
        ref self: TContractState,
        index: u32,
        salary_cipher_0: u128,
        salary_cipher_1: u128,
        salary_cipher_2: u128,
        salary_cipher_3: u128,
        salary_nonce_low: u128,
        salary_nonce_high: u128,
    );

    // Payroll runs
    fn record_payroll_run(
        ref self: TContractState,
        run_id: felt252,
        employee_count: u32,
        commitment: felt252,
    );

    // Views
    fn get_employee_count(self: @TContractState) -> u32;
    fn get_employee(self: @TContractState, index: u32) -> (felt252, felt252, bool);
    fn get_salary(self: @TContractState, index: u32) -> (u128, u128, u128, u128, u128, u128);
    fn is_employee_registered(self: @TContractState, pubkey_x: felt252, pubkey_y: felt252) -> bool;
    fn is_run_executed(self: @TContractState, run_id: felt252) -> bool;
    fn get_run_commitment(self: @TContractState, run_id: felt252) -> felt252;
    fn get_run_timestamp(self: @TContractState, run_id: felt252) -> u64;
    fn get_run_count(self: @TContractState) -> u32;
    fn get_run_id_at(self: @TContractState, index: u32) -> felt252;
    fn get_run_employee_count(self: @TContractState, run_id: felt252) -> u32;
    fn get_tongo_contract(self: @TContractState) -> ContractAddress;
    fn get_company_name(self: @TContractState) -> ByteArray;
    fn get_employer_pubkey(self: @TContractState) -> (felt252, felt252);

    // Payroll cadence: 1=monthly, 2=semi-monthly, 3=weekly
    fn set_cadence(ref self: TContractState, index: u32, cadence: u8);
    fn get_cadence(self: @TContractState, index: u32) -> u8;

    // Auditor
    fn set_auditor(ref self: TContractState, pubkey_x: felt252, pubkey_y: felt252);
    fn get_auditor(self: @TContractState) -> (felt252, felt252);
    fn set_audit_salary(
        ref self: TContractState, index: u32,
        cipher_0: u128, cipher_1: u128, cipher_2: u128, cipher_3: u128,
        nonce_low: u128, nonce_high: u128,
    );
    fn get_audit_salary(self: @TContractState, index: u32) -> (u128, u128, u128, u128, u128, u128);
}
