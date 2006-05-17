open Result

(* Process management *)
type pid = int
type proc_state = continuation * result
val suspended_processes : (proc_state * pid) Queue.t
val blocked_processes : (pid, proc_state * pid) Hashtbl.t
val messages : (pid, result Queue.t) Hashtbl.t
val current_pid : pid ref
val debug_process_status : unit -> unit

(* Primitive functions and values *)
type continuationized_val = [
  result
| `PFun of (continuation -> result -> result) * continuation * result -> continuationized_val
]
val value_env : (string * continuationized_val) list ref
val type_env : Kind.environment
val apply_pfun : (continuation -> result -> result) -> continuation -> string -> result list -> result
val primitive_stub : string -> result