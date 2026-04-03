use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use stealthpay::interface::{IPayrollManagerDispatcher, IPayrollManagerDispatcherTrait};

fn ADMIN() -> ContractAddress {
    'ADMIN'.try_into().unwrap()
}

fn NON_ADMIN() -> ContractAddress {
    'NON_ADMIN'.try_into().unwrap()
}

fn TONGO() -> ContractAddress {
    'TONGO'.try_into().unwrap()
}

fn FACTORY() -> ContractAddress {
    'FACTORY'.try_into().unwrap()
}

fn deploy() -> IPayrollManagerDispatcher {
    let contract = declare("PayrollManager").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![];
    ADMIN().serialize(ref calldata);
    TONGO().serialize(ref calldata);
    let name: ByteArray = "Test Company";
    name.serialize(ref calldata);
    let epk_x: felt252 = 0xAAA;
    let epk_y: felt252 = 0xBBB;
    epk_x.serialize(ref calldata);
    epk_y.serialize(ref calldata);
    // factory address (use zero to skip callbacks in unit tests)
    let zero: ContractAddress = 0.try_into().unwrap();
    zero.serialize(ref calldata);

    let (address, _) = contract.deploy(@calldata).unwrap();
    IPayrollManagerDispatcher { contract_address: address }
}

// Helper: register with dummy encrypted salary
fn register(dispatcher: IPayrollManagerDispatcher, px: felt252, py: felt252) {
    dispatcher.register_employee(px, py, 1, 2, 3, 4, 5, 6);
}

#[test]
fn test_initial_state() {
    let dispatcher = deploy();
    assert!(dispatcher.get_employee_count() == 0);
    assert!(dispatcher.get_run_count() == 0);
    assert!(dispatcher.get_tongo_contract() == TONGO());
    assert!(dispatcher.get_company_name() == "Test Company");
    let (epx, epy) = dispatcher.get_employer_pubkey();
    assert!(epx == 0xAAA);
    assert!(epy == 0xBBB);
}

#[test]
fn test_register_employee_with_salary() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    dispatcher.register_employee(0x123, 0x456, 10, 20, 30, 40, 50, 60);
    stop_cheat_caller_address(dispatcher.contract_address);

    assert!(dispatcher.get_employee_count() == 1);

    let (x, y, active) = dispatcher.get_employee(1);
    assert!(x == 0x123 && y == 0x456 && active);

    let (c0, c1, c2, c3, nl, nh) = dispatcher.get_salary(1);
    assert!(c0 == 10 && c1 == 20 && c2 == 30 && c3 == 40);
    assert!(nl == 50 && nh == 60);
}

#[test]
fn test_set_salary() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    register(dispatcher, 0x123, 0x456);
    dispatcher.set_salary(1, 100, 200, 300, 400, 500, 600);
    stop_cheat_caller_address(dispatcher.contract_address);

    let (c0, c1, c2, c3, nl, nh) = dispatcher.get_salary(1);
    assert!(c0 == 100 && c1 == 200 && c2 == 300 && c3 == 400);
    assert!(nl == 500 && nh == 600);
}

#[test]
fn test_register_multiple_employees() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    register(dispatcher, 0x1, 0x2);
    register(dispatcher, 0x3, 0x4);
    register(dispatcher, 0x5, 0x6);
    stop_cheat_caller_address(dispatcher.contract_address);

    assert!(dispatcher.get_employee_count() == 3);
}

#[test]
#[should_panic(expected: "Employee already registered")]
fn test_register_duplicate_fails() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    register(dispatcher, 0x123, 0x456);
    register(dispatcher, 0x123, 0x456);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
#[should_panic(expected: 'Caller is missing role')]
fn test_register_non_admin_fails() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, NON_ADMIN());
    register(dispatcher, 0x123, 0x456);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_deactivate_employee() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    register(dispatcher, 0x123, 0x456);
    dispatcher.deactivate_employee(1);
    stop_cheat_caller_address(dispatcher.contract_address);

    let (_, _, active) = dispatcher.get_employee(1);
    assert!(!active);
}

#[test]
fn test_reactivate_employee() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    register(dispatcher, 0x123, 0x456);
    dispatcher.deactivate_employee(1);
    dispatcher.reactivate_employee(1);
    stop_cheat_caller_address(dispatcher.contract_address);

    let (_, _, active) = dispatcher.get_employee(1);
    assert!(active);
}

#[test]
#[should_panic(expected: "Already inactive")]
fn test_deactivate_inactive_fails() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    register(dispatcher, 0x123, 0x456);
    dispatcher.deactivate_employee(1);
    dispatcher.deactivate_employee(1);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_record_payroll_run() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    dispatcher.record_payroll_run(0xABC, 5, 0xDEF);
    stop_cheat_caller_address(dispatcher.contract_address);

    assert!(dispatcher.is_run_executed(0xABC));
    assert!(dispatcher.get_run_commitment(0xABC) == 0xDEF);
    assert!(dispatcher.get_run_count() == 1);
}

#[test]
#[should_panic(expected: "Run already executed")]
fn test_duplicate_run_fails() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, ADMIN());
    dispatcher.record_payroll_run(0xABC, 5, 0xDEF);
    dispatcher.record_payroll_run(0xABC, 5, 0xDEF);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
#[should_panic(expected: 'Caller is missing role')]
fn test_record_run_non_manager_fails() {
    let dispatcher = deploy();

    start_cheat_caller_address(dispatcher.contract_address, NON_ADMIN());
    dispatcher.record_payroll_run(0xABC, 5, 0xDEF);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_unexecuted_run() {
    let dispatcher = deploy();
    assert!(!dispatcher.is_run_executed(0x999));
}
