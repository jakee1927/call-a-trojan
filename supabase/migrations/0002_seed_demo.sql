-- Demo seed: clearly-labeled demo helpers and SAMPLE verified answers (is_sample = true).
-- Real helpers sign up through /trojan. Safe to re-run.

insert into helpers (name, year, major, tags, bio, is_demo, on_shift_until)
select * from (values
  ('Demo Transfer Trojan', '2027', 'Political Science', array['transfer','d-clearance','registration','poir','smc'], 'Demo profile: transferred from a community college', true, null::timestamptz),
  ('Demo Engineering Trojan', '2026', 'Computer Science', array['csci','viterbi','professors','registration','internships'], 'Demo profile: CS junior', true, null::timestamptz),
  ('Demo Student Ambassador', '2027', 'Business Administration', array['applicants','first-gen','essays','financial-aid','tours'], 'Demo profile: admissions ambassador', true, null::timestamptz),
  ('Demo USG Senator', '2026', 'Public Policy', array['usg','funding','rso','senate','clubs'], 'Demo profile: USG senator', true, null::timestamptz),
  ('Demo Housing Trojan', '2028', 'Psychology', array['housing','dining','meal-plans','parking','spring-admit'], 'Demo profile: spring admit', true, null::timestamptz)
) as v(name, year, major, tags, bio, is_demo, on_shift_until)
where not exists (select 1 from helpers h where h.name = v.name);

insert into verified_answers (question, answer, helper_name, helper_major, helper_year, audience, topics, is_sample)
select * from (values
  ('Which dining hall is best, and when is it least crowded?',
   'Sample answer: most people I know rotate between the three, but go before noon or after 1:30 for lunch and you will skip the line. Weeknights after 7:30 are quiet too.',
   'Demo Housing Trojan', 'Psychology', '2028', 'current', array['dining','meal-plans'], true),
  ('Is a parking permit worth it if I live near campus?',
   'Sample answer: if you live within the Tram/shuttle area, most students skip the permit and use the free shuttles plus a bike. Get a permit only if you commute daily from outside the shuttle routes.',
   'Demo Housing Trojan', 'Psychology', '2028', 'current', array['parking','transportation'], true)
) as v(question, answer, helper_name, helper_major, helper_year, audience, topics, is_sample)
where not exists (select 1 from verified_answers va where va.question = v.question);
