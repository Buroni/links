(*** Debugging ***)
let debugging_enabled = Settings.add_bool false "debug"

(* print a debug message if debugging is enabled *)
let debug message = 
  (if Settings.get_value(debugging_enabled) then prerr_endline message)

let debug_if_set setting message =
  (if Settings.get_value(setting) then debug (message ()))