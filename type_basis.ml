(* Basis for types *)

open Utility

type type_var_set = Utility.IntSet.t


type primitive = [ `Bool | `Int | `Char | `Float | `XMLitem ]

type ('typ, 'row, 'ctype) type_basis = [
  | `Not_typed
  | `Primitive of primitive
  | `TypeVar of int
  | `Function of ('typ * 'typ)
  | `Record of 'row
  | `Variant of 'row
  | `Recursive of (int * 'typ)
  | `Collection of ('ctype * 'typ)
  | `DB ]

type 'typ field_spec_basis = [ `Present of 'typ | `Absent ]
type 'typ field_spec_map_basis = ('typ field_spec_basis) Utility.StringMap.t
type ('typ, 'row_var) row_basis = 'typ field_spec_map_basis * 'row_var 
type 'row row_var_basis =
    [ `RowVar of int option 
    | `RecRowVar of int * 'row ]

type type_variable = [`TypeVar of int | `RowVar of int | `CollectionTypeVar of int]
type quantifier = type_variable

type 'typ assumption_basis = ((quantifier list) * 'typ)
type 'typ environment_basis = ((string * 'typ assumption_basis) list)

(* Functions on environments *)
let environment_values = fun env -> snd (List.split env)
let lookup = fun x -> List.assoc x


(* Generation of fresh type variables *)
let type_variable_counter = ref 0

let fresh_raw_variable : unit -> int =
  function () -> 
    incr type_variable_counter; !type_variable_counter



module type TYPEOPS =
sig
  type typ
  type row_var
  type collection_type

  type field_spec = typ field_spec_basis
  type field_spec_map = typ field_spec_map_basis
  type row = (typ, row_var) row_basis

  (* fresh type variable generation *)
  val fresh_type_variable : unit -> typ
  val fresh_row_variable : unit -> row_var
  val fresh_collection_variable : unit -> collection_type

  (* empty row constructors *)
  val make_empty_closed_row : unit -> row
  val make_empty_open_row : unit -> row
  val make_empty_open_row_with_var : int -> row

  (* singleton row constructors *)
  val make_singleton_closed_row : (string * field_spec) -> row
  val make_singleton_open_row : (string * field_spec) -> row
  val make_singleton_open_row_with_var : (string * field_spec) -> int -> row

  (* row predicates *)
  val is_closed_row : row -> bool
  val is_absent_from_row : string -> row -> bool

  (* row update *)
  val set_field : (string * field_spec) -> row -> row

  (* constants *)
  val empty_field_env : typ field_spec_map_basis
  val closed_row_var : row_var
end

module type BASICTYPEOPS =
sig
  type typ
  type row_var'
  type collection_type'
 
  type field_spec = typ field_spec_basis
  type field_spec_map = typ field_spec_map_basis
  type row = (typ, row_var') row_basis

  val make_type_variable : int -> typ
  val make_row_variable : int -> row_var'
  val make_collection_variable : int -> collection_type'

  val empty_field_env : typ field_spec_map_basis
  val closed_row_var : row_var'

  val is_closed_row : row -> bool
end

module TypeOpsGen(BasicOps: BASICTYPEOPS) :
  (TYPEOPS
   with type typ = BasicOps.typ 
   and type row_var = BasicOps.row_var'
   and type collection_type = BasicOps.collection_type'
) =
struct
  type typ = BasicOps.typ
  type row_var = BasicOps.row_var'
  type collection_type = BasicOps.collection_type'

  type field_spec = BasicOps.field_spec
  type field_spec_map = BasicOps.field_spec_map
  type row = BasicOps.row

  let is_closed_row = BasicOps.is_closed_row

  let fresh_type_variable = BasicOps.make_type_variable -<- fresh_raw_variable
  let fresh_row_variable = BasicOps.make_row_variable -<- fresh_raw_variable
  let fresh_collection_variable = BasicOps.make_collection_variable -<- fresh_raw_variable

  let empty_field_env = BasicOps.empty_field_env
  let closed_row_var = BasicOps.closed_row_var

  let make_empty_closed_row () = empty_field_env, closed_row_var
  let make_empty_open_row () = empty_field_env, fresh_row_variable ()
  let make_empty_open_row_with_var var = empty_field_env, BasicOps.make_row_variable var

  let make_singleton_closed_row (label, field_spec) =
    StringMap.add label field_spec empty_field_env, closed_row_var
  let make_singleton_open_row (label, field_spec) =
    StringMap.add label field_spec empty_field_env, fresh_row_variable ()
  let make_singleton_open_row_with_var (label, field_spec) var =
    StringMap.add label field_spec empty_field_env, BasicOps.make_row_variable var

  let is_absent_from_row label =
    function
      | (field_env, row_var) as row ->
	  if StringMap.mem label field_env then
	    StringMap.find label field_env = `Absent
	  else
	    is_closed_row row

  let set_field (label, f) ((field_env, row_var) as row) =
    StringMap.add label f field_env, row_var
end