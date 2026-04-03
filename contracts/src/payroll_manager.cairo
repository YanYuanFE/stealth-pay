#[starknet::contract]
pub mod PayrollManager {
    use starknet::{ContractAddress, get_block_timestamp};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StoragePathEntry,
    };
    use core::poseidon::poseidon_hash_span;
    use openzeppelin_access::accesscontrol::AccessControlComponent;
    use openzeppelin_introspection::src5::SRC5Component;
    use crate::interface::{IPayrollManager, IPayrollFactoryDispatcher, IPayrollFactoryDispatcherTrait};

    // Components
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    // Implement external AccessControl methods
    #[abi(embed_v0)]
    impl AccessControlImpl =
        AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;

    // Role constants
    const ADMIN_ROLE: felt252 = selector!("ADMIN_ROLE");
    const PAYROLL_MANAGER_ROLE: felt252 = selector!("PAYROLL_MANAGER_ROLE");

    // Storage
    #[storage]
    struct Storage {
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        // Company
        company_name: ByteArray,
        tongo_contract: ContractAddress,
        factory: ContractAddress,
        // Employer Tongo public key (for ECDH decryption)
        employer_pubkey_x: felt252,
        employer_pubkey_y: felt252,
        // Optional auditor Tongo public key (can verify all payroll without spending)
        auditor_pubkey_x: felt252,
        auditor_pubkey_y: felt252,
        // Employee registry
        employee_pubkey_x: Map<u32, felt252>,
        employee_pubkey_y: Map<u32, felt252>,
        employee_active: Map<u32, bool>,
        employee_index_of: Map<felt252, u32>,  // pubkey_hash -> index
        employee_count: u32,
        // Encrypted salaries (AEChaCha: ciphertext u512 as 4xu128 + nonce u256 as 2xu128)
        salary_cipher_0: Map<u32, u128>,
        salary_cipher_1: Map<u32, u128>,
        salary_cipher_2: Map<u32, u128>,
        salary_cipher_3: Map<u32, u128>,
        salary_nonce_low: Map<u32, u128>,
        salary_nonce_high: Map<u32, u128>,
        // Audit-encrypted salaries (encrypted under ECDH(employer_sk, auditor_pk))
        audit_cipher_0: Map<u32, u128>,
        audit_cipher_1: Map<u32, u128>,
        audit_cipher_2: Map<u32, u128>,
        audit_cipher_3: Map<u32, u128>,
        audit_nonce_low: Map<u32, u128>,
        audit_nonce_high: Map<u32, u128>,
        // Payroll cadence per employee: 0=none, 1=monthly, 2=semi-monthly, 3=weekly
        employee_cadence: Map<u32, u8>,
        // Payroll runs
        run_executed: Map<felt252, bool>,
        run_commitment: Map<felt252, felt252>,
        run_timestamp: Map<felt252, u64>,
        run_employee_count: Map<felt252, u32>,
        run_count: u32,
        // Sequential run index → run_id for enumeration
        run_id_at: Map<u32, felt252>,
    }

    // Events — intentionally minimal to avoid leaking HR metadata on-chain.
    // Sensitive operations (register, deactivate, salary changes) emit NO events.
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    // Constructor
    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        tongo_contract: ContractAddress,
        company_name: ByteArray,
        employer_pubkey_x: felt252,
        employer_pubkey_y: felt252,
        factory: ContractAddress,
    ) {
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(ADMIN_ROLE, admin);
        self.accesscontrol._grant_role(PAYROLL_MANAGER_ROLE, admin);
        self.accesscontrol.set_role_admin(PAYROLL_MANAGER_ROLE, ADMIN_ROLE);

        self.tongo_contract.write(tongo_contract);
        self.company_name.write(company_name);
        self.employer_pubkey_x.write(employer_pubkey_x);
        self.employer_pubkey_y.write(employer_pubkey_y);
        self.factory.write(factory);
        self.employee_count.write(0);
        self.run_count.write(0);
    }

    // Implementation
    #[abi(embed_v0)]
    impl PayrollManagerImpl of IPayrollManager<ContractState> {
        fn register_employee(
            ref self: ContractState,
            pubkey_x: felt252,
            pubkey_y: felt252,
            salary_cipher_0: u128,
            salary_cipher_1: u128,
            salary_cipher_2: u128,
            salary_cipher_3: u128,
            salary_nonce_low: u128,
            salary_nonce_high: u128,
        ) {
            self.accesscontrol.assert_only_role(ADMIN_ROLE);

            let pubkey_hash = poseidon_hash_span(array![pubkey_x, pubkey_y].span());
            let existing = self.employee_index_of.entry(pubkey_hash).read();
            assert!(existing == 0, "Employee already registered");

            let count = self.employee_count.read();
            let index = count + 1;

            self.employee_pubkey_x.entry(index).write(pubkey_x);
            self.employee_pubkey_y.entry(index).write(pubkey_y);
            self.employee_active.entry(index).write(true);
            self.employee_index_of.entry(pubkey_hash).write(index);
            self.employee_count.write(index);

            // Store encrypted salary
            self.salary_cipher_0.entry(index).write(salary_cipher_0);
            self.salary_cipher_1.entry(index).write(salary_cipher_1);
            self.salary_cipher_2.entry(index).write(salary_cipher_2);
            self.salary_cipher_3.entry(index).write(salary_cipher_3);
            self.salary_nonce_low.entry(index).write(salary_nonce_low);
            self.salary_nonce_high.entry(index).write(salary_nonce_high);

            // Default cadence: monthly
            self.employee_cadence.entry(index).write(1);

            // Callback to factory: bind employee tongo pubkey → this payroll contract
            let factory_addr = self.factory.read();
            let zero: ContractAddress = 0.try_into().unwrap();
            if factory_addr != zero {
                let factory = IPayrollFactoryDispatcher { contract_address: factory_addr };
                factory.bind_employee(pubkey_hash);
            }

            // No event emitted — prevents HR metadata leakage on-chain
        }

        fn set_salary(
            ref self: ContractState,
            index: u32,
            salary_cipher_0: u128,
            salary_cipher_1: u128,
            salary_cipher_2: u128,
            salary_cipher_3: u128,
            salary_nonce_low: u128,
            salary_nonce_high: u128,
        ) {
            self.accesscontrol.assert_only_role(ADMIN_ROLE);
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            assert!(self.employee_active.entry(index).read(), "Employee not active");

            self.salary_cipher_0.entry(index).write(salary_cipher_0);
            self.salary_cipher_1.entry(index).write(salary_cipher_1);
            self.salary_cipher_2.entry(index).write(salary_cipher_2);
            self.salary_cipher_3.entry(index).write(salary_cipher_3);
            self.salary_nonce_low.entry(index).write(salary_nonce_low);
            self.salary_nonce_high.entry(index).write(salary_nonce_high);
        }

        fn deactivate_employee(ref self: ContractState, index: u32) {
            self.accesscontrol.assert_only_role(ADMIN_ROLE);
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            assert!(self.employee_active.entry(index).read(), "Already inactive");

            self.employee_active.entry(index).write(false);

            // Unbind from factory
            let factory_addr = self.factory.read();
            let zero: ContractAddress = 0.try_into().unwrap();
            if factory_addr != zero {
                let pubkey_hash = poseidon_hash_span(array![
                    self.employee_pubkey_x.entry(index).read(),
                    self.employee_pubkey_y.entry(index).read(),
                ].span());
                let factory = IPayrollFactoryDispatcher { contract_address: factory_addr };
                factory.unbind_employee(pubkey_hash);
            }

            // No event emitted — prevents employment status leakage
        }

        fn reactivate_employee(ref self: ContractState, index: u32) {
            self.accesscontrol.assert_only_role(ADMIN_ROLE);
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            assert!(!self.employee_active.entry(index).read(), "Already active");

            self.employee_active.entry(index).write(true);
            // No event emitted — prevents employment status leakage
        }

        fn record_payroll_run(
            ref self: ContractState,
            run_id: felt252,
            employee_count: u32,
            commitment: felt252,
        ) {
            self.accesscontrol.assert_only_role(PAYROLL_MANAGER_ROLE);
            assert!(!self.run_executed.entry(run_id).read(), "Run already executed");

            let timestamp = get_block_timestamp();
            self.run_executed.entry(run_id).write(true);
            self.run_commitment.entry(run_id).write(commitment);
            self.run_timestamp.entry(run_id).write(timestamp);
            self.run_employee_count.entry(run_id).write(employee_count);
            let count = self.run_count.read();
            let new_count = count + 1;
            self.run_id_at.entry(new_count).write(run_id);
            self.run_count.write(new_count);

            // No event emitted — prevents payroll schedule and headcount leakage
        }

        // View functions
        fn get_employee_count(self: @ContractState) -> u32 {
            self.employee_count.read()
        }

        fn get_employee(self: @ContractState, index: u32) -> (felt252, felt252, bool) {
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            (
                self.employee_pubkey_x.entry(index).read(),
                self.employee_pubkey_y.entry(index).read(),
                self.employee_active.entry(index).read(),
            )
        }

        fn get_salary(self: @ContractState, index: u32) -> (u128, u128, u128, u128, u128, u128) {
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            (
                self.salary_cipher_0.entry(index).read(),
                self.salary_cipher_1.entry(index).read(),
                self.salary_cipher_2.entry(index).read(),
                self.salary_cipher_3.entry(index).read(),
                self.salary_nonce_low.entry(index).read(),
                self.salary_nonce_high.entry(index).read(),
            )
        }

        fn get_employer_pubkey(self: @ContractState) -> (felt252, felt252) {
            (self.employer_pubkey_x.read(), self.employer_pubkey_y.read())
        }

        fn is_employee_registered(
            self: @ContractState, pubkey_x: felt252, pubkey_y: felt252
        ) -> bool {
            let pubkey_hash = poseidon_hash_span(array![pubkey_x, pubkey_y].span());
            self.employee_index_of.entry(pubkey_hash).read() > 0
        }

        fn is_run_executed(self: @ContractState, run_id: felt252) -> bool {
            self.run_executed.entry(run_id).read()
        }

        fn get_run_commitment(self: @ContractState, run_id: felt252) -> felt252 {
            self.run_commitment.entry(run_id).read()
        }

        fn get_run_timestamp(self: @ContractState, run_id: felt252) -> u64 {
            self.run_timestamp.entry(run_id).read()
        }

        fn get_run_count(self: @ContractState) -> u32 {
            self.run_count.read()
        }

        fn get_tongo_contract(self: @ContractState) -> ContractAddress {
            self.tongo_contract.read()
        }

        fn get_company_name(self: @ContractState) -> ByteArray {
            self.company_name.read()
        }

        fn get_run_id_at(self: @ContractState, index: u32) -> felt252 {
            assert!(index > 0 && index <= self.run_count.read(), "Invalid run index");
            self.run_id_at.entry(index).read()
        }

        fn get_run_employee_count(self: @ContractState, run_id: felt252) -> u32 {
            self.run_employee_count.entry(run_id).read()
        }

        fn set_cadence(ref self: ContractState, index: u32, cadence: u8) {
            self.accesscontrol.assert_only_role(ADMIN_ROLE);
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            assert!(cadence >= 1 && cadence <= 3, "Invalid cadence: 1=monthly, 2=semi-monthly, 3=weekly");
            self.employee_cadence.entry(index).write(cadence);
        }

        fn get_cadence(self: @ContractState, index: u32) -> u8 {
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            self.employee_cadence.entry(index).read()
        }

        fn set_audit_salary(
            ref self: ContractState,
            index: u32,
            cipher_0: u128, cipher_1: u128, cipher_2: u128, cipher_3: u128,
            nonce_low: u128, nonce_high: u128,
        ) {
            self.accesscontrol.assert_only_role(ADMIN_ROLE);
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            self.audit_cipher_0.entry(index).write(cipher_0);
            self.audit_cipher_1.entry(index).write(cipher_1);
            self.audit_cipher_2.entry(index).write(cipher_2);
            self.audit_cipher_3.entry(index).write(cipher_3);
            self.audit_nonce_low.entry(index).write(nonce_low);
            self.audit_nonce_high.entry(index).write(nonce_high);
        }

        fn get_audit_salary(self: @ContractState, index: u32) -> (u128, u128, u128, u128, u128, u128) {
            assert!(index > 0 && index <= self.employee_count.read(), "Invalid index");
            (
                self.audit_cipher_0.entry(index).read(),
                self.audit_cipher_1.entry(index).read(),
                self.audit_cipher_2.entry(index).read(),
                self.audit_cipher_3.entry(index).read(),
                self.audit_nonce_low.entry(index).read(),
                self.audit_nonce_high.entry(index).read(),
            )
        }

        fn set_auditor(ref self: ContractState, pubkey_x: felt252, pubkey_y: felt252) {
            self.accesscontrol.assert_only_role(ADMIN_ROLE);
            self.auditor_pubkey_x.write(pubkey_x);
            self.auditor_pubkey_y.write(pubkey_y);
        }

        fn get_auditor(self: @ContractState) -> (felt252, felt252) {
            (self.auditor_pubkey_x.read(), self.auditor_pubkey_y.read())
        }
    }
}
