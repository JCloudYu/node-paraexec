# PTask #
This is a nodejs parallel tasking library that aims to provide some basic inter-thread communication mechanism along with some easy-to-use interfaces.

## Installation ##
```
npm install ptask
```

### Usage ###
#### Creating a child thread ####
```
const task_init_data = {};
const worker_thread_init_options = {};
const subtask = require('ptask').create(
	`some_script.js`, task_init_data, worker_thread_init_options
);
```