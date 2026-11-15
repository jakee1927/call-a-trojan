-- Give the demo helpers realistic first names (still is_demo = true and labeled "demo profile" in the UI).
update helpers set name = 'Daniel' where is_demo and name = 'Demo Transfer Trojan';
update helpers set name = 'Priya'  where is_demo and name = 'Demo Engineering Trojan';
update helpers set name = 'Marcus' where is_demo and name = 'Demo Student Ambassador';
update helpers set name = 'Sofia'  where is_demo and name = 'Demo USG Senator';
update helpers set name = 'Lena'   where is_demo and name = 'Demo Housing Trojan';
update verified_answers set helper_name = 'Lena' where is_sample and helper_name = 'Demo Housing Trojan';
