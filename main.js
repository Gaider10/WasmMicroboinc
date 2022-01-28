var Client = {}

Client.Api = {}

Client.Api.baseUrl = "https://api.microboinc.com";
Client.Api.apiKey = "";
Client.Api.send = (type, endpoint, payload, callback) => {
    let url = Client.Api.baseUrl + endpoint;

    // console.log(`Sending to ${url}`);
    // console.log(payload);

    if (Client.Api.apiKey == "") {
        console.warn("Tried to send a request without an api key!");
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            // console.log(`Response: ${xhr.responseText}`)
            callback(JSON.parse(xhr.response));
        }
    }
    if (false) {
        let corsProxy = "http://localhost:3000";
        xhr.open(type, corsProxy, true);
        xhr.setRequestHeader("Target-URL", url);
    } else {
        xhr.open(type, url, true);
    }
    xhr.setRequestHeader("Authorization", Client.Api.apiKey);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(payload));
};
Client.Api.projects_compatible = (payload, callback) => {
    // Client.Api.send("POST", "/projects/compatible", payload, callback);
    callback({
        projectsBinaries: [
            {
                binary: {
                    downloadURL: "https://gaider10.github.io/WasmMicroboinc/lce12eyelargewiiu/lce12eyelargewiiu.js",
                },
                project: {
                    id: 5,
                },
            }
        ]
    });
};
Client.Api.feeder_ofprojects = (payload, callback) => {
    Client.Api.send("POST", "/feeder/ofprojects", payload, callback);
};
Client.Api.results_submit = (payload, callback) => {
    Client.Api.send("POST", "/results/submit", payload, callback);
};

Client.threadCount = 1;
Client.downloadBinaries = true;
Client.receiveNew = true;
Client.runNew = true;
Client.completed_tasks = 0;
Client.project_binaries = {};
Client.assigned_tasks = [];
Client.running_tasks = [];

Client.setThreadCount = (threadCount) => {
    Client.threadCount = threadCount
    document.getElementById("threadCountOutput").innerText = `Current thread count: ${threadCount}`;
};
Client.setApiKey = (apiKey) => {
    Client.Api.apiKey = apiKey;
    document.getElementById("apiKeyOutput").innerText = "Api key is set";
};

Client.run_task = (binary, task) => {
    console.log(`Starting task ${task.id} (assignment ${task.assignment_id}) from project ${task.project}`);

    let mod = {
        stdoutText: "",
        stderrText: "",
        arguments: ["--input", "input.txt"],
        preRun: (mod) => {
            mod.FS.init(
                () => null,
                c => { if (c != null) mod.stdoutText += String.fromCharCode(c) },
                c => { if (c != null) mod.stderrText += String.fromCharCode(c) }
            );
            mod.FS.writeFile("input.txt", task.input);
        }
    };
    task.mod = mod;

    binary(mod).then(mod => {

    });
};
Client.try_run_new_tasks = () => {
    for (let i = Client.assigned_tasks.length - 1; i >= 0 && Client.running_tasks.length < Client.threadCount; i--) {
        let task = Client.assigned_tasks[i];
        let project = task.project;
        let binary = Client.project_binaries[project];
        if (binary != undefined) {
            Client.assigned_tasks.splice(i, 1);
            Client.running_tasks.push(task);
            Client.run_task(binary, task);
        } else {
            console.warn(`Tried to run task ${task.id} (assignment ${task.assignment_id}) for project ${task.project} that doesn't have a downloaded binary`);
        }
    }
};
Client.try_get_new_tasks = () => {
    if (Client.Api.apiKey == "" || !Client.receiveNew) {
        return;
    }

    let taskCount = (Client.threadCount * 3) - (Client.assigned_tasks.length + Client.running_tasks.length);
    let projectIds = Object.keys(Client.project_binaries).map(s => parseInt(s));
    if (projectIds.length == 0 || taskCount < Client.threadCount) {
        return;
    }

    console.log(`Getting ${taskCount} new tasks`);

    Client.Api.feeder_ofprojects({
        AcceptedProjectsIDs: projectIds,
        TaskCount: taskCount,
    }, response => {
        let assignments = response["assignments"];
        for (let assignment of assignments) {
            let taskObj = assignment["task"];
            let task = {
                assignment_id: assignment["id"],
                id: taskObj["id"],
                project: taskObj["projectID"],
                input: taskObj["inputData"],
            };
            console.log(`Got task ${task.id} (assignment ${task.assignment_id}) from project ${task.project}`);
            Client.assigned_tasks.push(task);
        }
    });
};
Client.check_running_tasks = () => {
    if (Client.Api.apiKey == "") {
        return;
    }

    for (let i = Client.running_tasks.length - 1; i >= 0; i--) {
        let task = Client.running_tasks[i];
        let mod = task.mod;
        if (mod.calledRun && Object.keys(mod.PThread.pthreads).length == 0) {
            Client.running_tasks.splice(i, 1);
            console.log(`Finished task ${task.id} (assignment ${task.assignment_id}) from project ${task.project}`);
            Client.completed_tasks++;
            Client.Api.results_submit({
                StdErr: mod.stderrText,
                StdOut: mod.stdoutText,
                ExitCode: 0,
                AssignmentID: task.assignment_id,
                ExecutionTime: 0,
            }, () => {});
        }
    }

    if (Client.runNew) {
        Client.try_run_new_tasks();
    }
};
Client.download_binary = (url, project) => {
    console.log(`Downloading binary for project ${project} from ${url}`)
    let filename = url.substring(url.lastIndexOf("/") + 1, url.lastIndexOf("."));
    let id = "binary_" + filename;
    if (document.getElementById(id) != null) {
        console.warn("Tried to download the same binary twice: " + url);
    }

    let script = document.createElement("script");
    script.onload = () => {
        Client.project_binaries[project] = window[filename];
    };
    script.src = url;
    script.id = id;
    document.head.appendChild(script);
};
Client.try_download_new_binaries = () => {
    if (Client.Api.apiKey == "" || !Client.downloadBinaries) {
        return;
    }

    Client.Api.projects_compatible({
        PlatformsIDs: [5],
    }, (response) => {
        let projectsBinaries = response["projectsBinaries"];
        for (let projectsBinary of projectsBinaries) {
            let url = projectsBinary["binary"]["downloadURL"];
            let project = projectsBinary["project"]["id"];
            if (Client.project_binaries[project] == undefined) {
                Client.download_binary(url, project);
            }
        }
    });
};
Client.update_outputs = () => {
    document.getElementById("completedTasksOutput").innerText = `Completed Tasks: ${Client.completed_tasks}`;
    document.getElementById("queuedTasksOutput").innerText = `Queued Tasks: ${Client.assigned_tasks.length}`;
    document.getElementById("runningTasksOutput").innerText = `Running Tasks: ${Client.running_tasks.length}`;
};

window.setInterval(Client.update_outputs, 250);
window.setInterval(Client.check_running_tasks, 500);
window.setInterval(Client.try_get_new_tasks, 10000);
window.setInterval(Client.try_download_new_binaries, 10000)