let jsonize_primitive : Sl_result.primitive -> string = function
  | `Bool value -> string_of_bool value
  | `Int value -> Num.string_of_num value
  | `Float value -> string_of_float value
  | `Char c -> "'"^ Char.escaped c ^"'"
  | `XML _
  | `PFunction _ as p -> prerr_endline ("Can't yet jsonize " ^ Sl_result.string_of_primitive p); ""

let rec jsonize_result : Sl_result.result -> string = function
  | `Variant _
  | `Database _
  | `Environment _
  | `Continuation _
  | `Collection (`List, (`Primitive(`XML _)::_))
  | `Function _ as r -> prerr_endline ("Can't yet jsonize " ^ Sl_result.string_of_result r); ""
  | `Primitive p -> jsonize_primitive p
  | `Record fields -> "{" ^ String.concat ", " (List.map (fun (k, v) -> "\"" ^ k ^ "\" : " ^ jsonize_result v) fields) ^ "}"
  | `Collection (_, []) -> "[]"
  | `Collection (`List, `Primitive(`Char _)::_) as c  -> "\"" ^ Sl_result.escape (Sl_result.charlist_as_string c) ^ "\""
  | `Collection (`List, elems) -> "[" ^ String.concat ", " (List.map jsonize_result elems) ^ "]"
  | r -> prerr_endline ("Can't yet jsonize " ^ Sl_result.string_of_result r); ""

