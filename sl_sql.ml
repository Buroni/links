(** Contains the definition of an sql statement. *)

open Num
open List
open Sl_pickle
open Query

let rec string_of_expression : expression -> string = function
  | Field (table, field)     -> table ^"."^ field
(*   | NamedField field         -> field *)
  | Variable name            -> "VARIABLE:"^ name
  | Null                     -> "NULL"
  | Integer value            -> string_of_num value
  | Float value              -> string_of_float value
  | Boolean value            -> string_of_bool value
  | Text value               -> "\'"^ value ^"\'"
  | Binary_op (symbol, l, r) -> "("^ string_of_expression l ^" "^ symbol ^" "^ string_of_expression r ^")"
  | Unary_op (symbol, expr)  -> "("^ symbol ^" "^ (string_of_expression expr) ^")"
  | Query query              -> "("^ string_of_query query ^")"
and string_of_query (qry:query) : string =
   let {distinct_only = distinct; result_cols = selects;
	tables = tables; condition = where; sortings = order} = qry 
   in
     "SELECT "^ (if distinct then "DISTINCT " else "")
     ^ (match selects with
	  | [] -> "NULL as null"
	  | _ -> (String.concat ", " (map (fun col -> col.table_renamed ^"."^ col.name ^" AS "^ col.renamed) qry.result_cols)))
     ^ " FROM " ^ (String.concat ", " (map (fun (table, rename) -> table ^ " AS " ^ rename) tables)) ^
       string_of_condition where
     ^ (match order with
	  | [] -> "" 
	  | orders -> " ORDER BY "^(String.concat ", " (map (function
                                                               | `Asc (db, col)  -> db ^"."^ col ^" ASC" 
                                                               | `Desc (db, col) -> db ^"."^ col ^" DESC") 
							  orders)))
     ^ ""
and string_of_condition cond = match string_of_expression cond with
  | "true" -> ""
  | where  -> " WHERE " ^ where
	
(** conjunction, disjunction
    These routines should form simplified SQL expressions out of a
    list of SQL exprs.
*)

let rec conjunction = function
  | [] -> Boolean true
  | (Boolean true :: ts) -> conjunction ts
  | (Boolean false :: ts) -> Boolean false
  | (t :: ts) -> match conjunction ts with
	Boolean true -> t
      | Boolean false -> Boolean false
      | rhs -> Binary_op("AND", t, rhs)

let rec disjunction = function
  | [] -> Boolean false
  | (Boolean true :: ts) -> Boolean true
  | (Boolean false :: ts) -> disjunction ts
  | (t :: ts) -> match disjunction ts with
	Boolean true -> Boolean true
      | Boolean false -> t
      | rhs -> Binary_op("OR", t, rhs)

let rec negation t = Unary_op("NOT", t)

let rec serialise_expression : (expression serialiser) = 
  function
    | Field v -> serialise2 'a' (serialise_string, serialise_string) v
    | Variable v -> serialise1 'b'  (serialise_string) v
    | Null -> serialise0 'c' () ()
    | Integer v -> serialise1 'd'  (serialise_int) v
    | Float v -> serialise1 'e'  (serialise_float) v
    | Boolean v -> serialise1 'f'  (serialise_bool) v
    | Text v -> serialise1 'g'  (serialise_string) v
    | Binary_op v -> serialise3 'h'  (serialise_string, serialise_expression, serialise_expression) v
    | Unary_op v -> serialise2 'i'  (serialise_string, serialise_expression) v
    | Query v -> serialise1 'j' (serialise_query) v
and deserialise_expression : (expression deserialiser) =
  fun s -> let t, obj, rest = extract_object s in
  let e = 
    (match t with
    | 'a' -> Field (deserialise2 (deserialise_string, deserialise_string) obj)
    | 'b' -> Variable (deserialise1 (deserialise_string) obj)
    | 'c' -> (deserialise0 () obj); Null
    | 'd' -> Integer (deserialise1 (deserialise_int) obj)
    | 'e' -> Float (deserialise1  (deserialise_float) obj)
    | 'f' -> Boolean (deserialise1 (deserialise_bool) obj)
    | 'g' -> Text (deserialise1 (deserialise_string) obj)
    | 'h' -> Binary_op (deserialise3 (deserialise_string, deserialise_expression, deserialise_expression) obj)
    | 'i' -> Unary_op (deserialise2 (deserialise_string, deserialise_expression) obj)
    | 'j' -> Query (deserialise1 (deserialise_query) obj)
    | _ -> failwith "Error deserialising expression")
  in e, rest

and serialise_query : (query serialiser) =
  function 
    | s -> serialise5 'Q' (serialise_bool, 
                           serialise_list serialise_column,
                           serialise_list serialise_table,
                           serialise_expression,
                           serialise_list serialise_ordering)
                          (s.distinct_only, s.result_cols, s.tables,
					    s.condition, s.sortings)
and deserialise_query : (query deserialiser) =
  fun s ->
    let t, obj, rest = extract_object s in 
    let (d,r,t,c,s) = (match t with
               | 'Q' -> deserialise5 (deserialise_bool, 
                                      deserialise_list deserialise_column,
                                      deserialise_list deserialise_table,
                                      deserialise_expression,
                                      deserialise_list deserialise_ordering) obj
               | _ -> failwith "Error deserialising query")
    in {distinct_only=d;result_cols=r;tables=t;condition=c;sortings=s}, rest
and serialise_column : column serialiser
    = fun b -> serialise4 'B' (serialise_string, serialise_string, serialise_string, Sl_kind.serialise_kind) (b.table_renamed, b.name, b.renamed, b.col_type)
and deserialise_column : column deserialiser
    = fun s ->
      let t, obj, rest = extract_object s in
        let (t,n,r,k), rest = match t with
          | 'B' -> deserialise4 (deserialise_string, deserialise_string, deserialise_string, Sl_kind.deserialise_kind) obj, rest
          | x -> failwith ("Error deserialising column header (expected 'B'; got '"^ String.make 1 x ^ "')")
      in
        {table_renamed=t; name=n; renamed=r; col_type=k}, rest

and serialise_table : (string * string) serialiser
    = fun b -> serialise2 'T' (serialise_string, serialise_string) b
and deserialise_table : (string * string) deserialiser
    = fun s ->
      let t, obj, rest = extract_object s in
        match t with
          | 'T' -> deserialise2 (deserialise_string, deserialise_string) obj, rest
          | x -> failwith ("Error deserialising column header (expected 'T'; got '"^ String.make 1 x ^"')")
and serialise_ordering : ([`Asc of (string * string) | `Desc of (string * string)] serialiser) =
  function
    | `Asc v ->  serialise2 'A' (serialise_string, serialise_string) v
    | `Desc v -> serialise2 'D'(serialise_string, serialise_string) v
and deserialise_ordering : ([`Asc of (string * string) | `Desc of (string * string)] deserialiser) =
  fun s -> let t, obj, rest = extract_object s in
  let e = 
    (match t with
       | 'A' -> `Asc (deserialise2 (deserialise_string, deserialise_string) obj)
       | 'D' -> `Desc (deserialise2 (deserialise_string, deserialise_string) obj)
       | _ -> failwith "Error deserialising ordering")
  in e, rest

