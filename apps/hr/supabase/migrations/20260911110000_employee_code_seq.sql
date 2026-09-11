-- Stable, human-readable employee codes, same pattern as the recruitment
-- app's application_code_seq.
create sequence employee_code_seq start 1001;

alter table employees
  alter column employee_code set default ('EMP-' || nextval('employee_code_seq'));
