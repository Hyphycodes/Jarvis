-- Security: move pgvector out of the public schema. The `extensions` schema is on
-- the role search_path ("$user", public, extensions), so unqualified `vector`
-- types and the `<=>` operator keep resolving. Verified: memory_items.embedding
-- still types as `vector` and `'[1,2,3]'::vector <=> '[1,2,3]'::vector` evaluates.
alter extension vector set schema extensions;
