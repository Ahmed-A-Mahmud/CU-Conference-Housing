import React, { useState, useEffect, useRef } from "react";
import ProgressBar from "progressbar.js";
import axios from "axios";
import "./styles.css";

function App() {
  const [inputValue, setInputValue] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const progressBarRef = useRef(null);
  const [statusMessage, setStatusMessage] = useState({
    message: "",
    error: "",
  });

  useEffect(() => {
    if (!progressBarRef.current) {
      progressBarRef.current = new ProgressBar.Line("#progress-container", {
        strokeWidth: 4,
        easing: "easeInOut",
        duration: 1400,
        color: "#3C69E7", // Pantone 284 color
        trailColor: "#eee",
        trailWidth: 1,
        text: {
          style: {
            color: "#3C69E7", // Pantone 284 color for text
            position: "relative", // Changed from 'absolute' to 'relative'
            // Remove or adjust right and top properties
            fontSize: "2em",
            padding: 0,
            margin: "0 0 0 30px", // Adjust the margin as needed
            transform: null,
          },
          autoStyleContainer: false,
        },
        from: { color: "#3C69E7" }, // Pantone 284 color
        to: { color: "#3C69E7" }, // Pantone 284 color
        step: (state, bar) => {
          bar.setText(Math.round(bar.value() * 100) + " %");
        },
      });
    }
  }, []);

  const asanaApi = axios.create({
    baseURL: "https://app.asana.com/api/1.0",
    headers: {
      Authorization:
        "Bearer 1/1201598818645288:5fc1fde19d751f71f8dda45c588f9bc5",
      Accept: "application/json",
    },
  });

  // Step 1: Verify Conference Name
  const verifyConferenceName = async (name) => {
    const response = await asanaApi.get(`/projects/1205913434265595/tasks`);
    const matchedTask = response.data.data.find(
      (task) => task.name.toLowerCase() === name.toLowerCase(),
    );
    if (!matchedTask) {
      setCurrentStep(1); // Manually set the current step before throwing the error
      throw new Error("Conference Name Not Found");
    }
    return matchedTask;
  };

  // Step 2: Verify Active Status
  const verifyActiveStatus = async (matchedTask) => {
    const taskDetailsResponse = await asanaApi.get(`/tasks/${matchedTask.gid}`);
    const taskDetails = taskDetailsResponse.data.data;
    const conferenceStatus = taskDetails.custom_fields.find(
      (f) => f.gid === "1205789017325292",
    )?.enum_value?.gid;
    if (conferenceStatus !== "1205789017325294") {
      throw new Error("Conference Status is not Active");
    }
    return taskDetails;
  };

  // Step 3: Verify Custom Fields
  const verifyCustomFields = (taskDetails) => {
    const requiredFields = [
      "1205769056172791",
      "1205769057554040",
      "1205769057554051",
      "1205655168623820",
      "1205769099268143",
    ]; // GIDs of required fields
    let missingFields = [];

    requiredFields.forEach((fieldGID) => {
      const field = taskDetails.custom_fields.find((f) => f.gid === fieldGID);

      // Check for multi-select field
      if (field?.resource_subtype === "multi_enum") {
        if (!field.multi_enum_values || field.multi_enum_values.length === 0) {
          missingFields.push(field.name); // No selections in multi-select field
        }
      } else {
        // For other field types (single-select, etc.)
        if (!field || !field.enum_value) {
          missingFields.push(field.name);
        }
      }
    });
    if (missingFields.length > 0) {
      throw new Error(
        `Missing Data/Values for Custom Fields - ${missingFields.join(", ")}`,
      );
    }

    return taskDetails;
  };

  // Steps 4 and 5: Create Check-In and Check-Out Tasks
  const createCheckInTasks = async (conferenceTask) => {
    try {
      const createSubtasks = async (taskId, dueDate) => {
        const subtasks = [
          { name: "Pickup IDs from ID Center", daysBefore: 14 },
          { name: "Verify First Check-In Reminder Email", daysBefore: 14 },
          { name: "Program Card/ID Access", daysBefore: 7 },
          { name: "Label ID Envelopes", daysBefore: 7 },
          { name: "Create Welcome Packets", daysBefore: 6 },
          { name: "Verify Second Check-In Reminder Email", daysBefore: 3 },
        ];

        // Check Linen Status and create relevant subtasks
        const linenStatus = customFields["1205769057554051"];
        if (linenStatus === "1205769057554053") {
          // GID for 'Rental Linens'
          subtasks.push({
            name: "Distribute Rental Linens",
            daysBefore: 1,
            project: "1205913434265579",
            section: "1205999543338739", // Section ID for 'Rental Linens Used'
          });
        } else if (linenStatus === "1205769057554054") {
          // GID for 'Purchased Linens'
          subtasks.push({
            name: "Distribute Purchased Linens",
            daysBefore: 1,
            project: "1205913434265579",
            section: "1205999543338740", // Section ID for 'Purchased Linens Used'
          });
        }

        // Creating subtasks
        for (const subtask of subtasks) {
          const subtaskDueDate = new Date(dueDate);
          subtaskDueDate.setDate(subtaskDueDate.getDate() - subtask.daysBefore);

          const subtaskData = {
            name: subtask.name,
            due_on: subtaskDueDate.toISOString().split("T")[0], // Format as 'YYYY-MM-DD'
          };

          if (subtask.project) {
            subtaskData.memberships = [
              {
                project: subtask.project,
                section: subtask.section,
              },
            ];
          }

          await asanaApi.post(`/tasks/${taskId}/subtasks`, {
            data: subtaskData,
          });
        }
      };
      const createSingleTask = async (
        name,
        dueDate,
        sectionId,
        isCheckInTask,
      ) => {
        if (dueDate) {
          const response = await asanaApi.post("/tasks", {
            data: {
              name,
              projects: ["1205913434265583"],
              workspace: "1156738660966273",
              due_on: dueDate.date,
              custom_fields: customFields,
              memberships: [
                {
                  project: "1205913434265583",
                  section: sectionId,
                },
              ],
            },
          });

          const taskId = response.data.data.gid;

          const buildingField = conferenceTask.custom_fields.find(
            (f) => f.gid === "1205844902357505",
          );
          const buildingValues = buildingField.multi_enum_values.map(
            (option) => option.gid,
          );
          console.log(buildingValues);

          // Update the task with the multi-select custom field
          await asanaApi.put(`/tasks/${taskId}`, {
            data: {
              custom_fields: {
                1205844902357505: buildingValues, // Multi-select field values
              },
            },
          });

          if (isCheckInTask) {
            await createSubtasks(response.data.data.gid, dueDate.date);
          }
        }
      };

      // Custom fields setup as before
      const customFields = {
        1205769056172791: conferenceTask.custom_fields.find(
          (f) => f.gid === "1205769056172791",
        )?.enum_value.gid,
        1205769057554040: conferenceTask.custom_fields.find(
          (f) => f.gid === "1205769057554040",
        )?.enum_value.gid,
        1205769057554051: conferenceTask.custom_fields.find(
          (f) => f.gid === "1205769057554051",
        )?.enum_value.gid,
        1205769099268143: conferenceTask.custom_fields.find(
          (f) => f.gid === "1205769099268143",
        )?.enum_value.gid,
      };

      // Extract date values
      const staffCheckInDate = conferenceTask.custom_fields.find(
        (f) => f.gid === "1205814574301620",
      )?.date_value;
      const staffCheckOutDate = conferenceTask.custom_fields.find(
        (f) => f.gid === "1205814574301622",
      )?.date_value;
      const participantsCheckInDate = conferenceTask.custom_fields.find(
        (f) => f.gid === "1205769248175820",
      )?.date_value;
      const participantsCheckOutDate = conferenceTask.custom_fields.find(
        (f) => f.gid === "1205769249517032",
      )?.date_value;

      if (participantsCheckInDate && participantsCheckOutDate) {
        await createSingleTask(
          conferenceTask.name + " Participants Check-In Tasks",
          participantsCheckInDate,
          "1205946013852180",
          true,
        );
      }

      if (staffCheckInDate && staffCheckOutDate) {
        await createSingleTask(
          conferenceTask.name + " Staff Check-In Tasks",
          staffCheckInDate,
          "1205946013852180",
          true,
        );
      }

      setStatusMessage({
        message: "Check-In Tasks Created Successfully",
        isError: false,
      });
    } catch (error) {
      console.error("Error Creating Check-In Tasks", error);
      setStatusMessage({
        message: "Error: Failed to Create Check-In Tasks",
        isError: true,
      });
    }
  };

  const createCheckOutTasks = async (conferenceTask) => {
    try {
      const createCheckOutSubtasks = async (taskId, dueDate) => {
        const subtasks = [
          { name: "Verify First Check-Out Reminder Email", daysBefore: 14 },
          { name: "Verify Second Check-Out Reminder Email", daysBefore: 3 },
          { name: "Complete Vacancy Verifications", daysBefore: 0 },
          { name: "Collect Service Cards/Hard Keys", daysBefore: 0 },
          { name: "Send Rooms to Facilities to Be Cleaned", daysBefore: 0 },
        ];

        // Conditional subtask based on Linen Status
        if (customFields["1205769057554051"] !== "1205769057554052") {
          // Check Linen Status
          subtasks.push({ name: "Collect Linens", daysBefore: 0 });
          subtasks.push({
            name: "Leave Bin(s) for Linen Collection",
            daysBefore: 1,
          });
        }

        for (const subtask of subtasks) {
          const subtaskDueDate = new Date(dueDate);
          subtaskDueDate.setDate(subtaskDueDate.getDate() - subtask.daysBefore);

          await asanaApi.post(`/tasks/${taskId}/subtasks`, {
            data: {
              name: subtask.name,
              due_on: subtaskDueDate.toISOString().split("T")[0], // format as 'YYYY-MM-DD'
            },
          });
        }
      };

      const createSingleTask = async (
        name,
        dueDate,
        sectionId,
        isCheckInTask,
      ) => {
        if (dueDate) {
          const response = await asanaApi.post("/tasks", {
            data: {
              name,
              projects: ["1205913434265583"],
              workspace: "1156738660966273",
              due_on: dueDate.date,
              custom_fields: customFields,
              memberships: [
                {
                  project: "1205913434265583",
                  section: sectionId,
                },
              ],
            },
          });

          const taskId = response.data.data.gid;

          const buildingField = conferenceTask.custom_fields.find(
            (f) => f.gid === "1205844902357505",
          );
          const buildingValues = buildingField.multi_enum_values.map(
            (option) => option.gid,
          );
          console.log(buildingValues);

          // Update the task with the multi-select custom field
          await asanaApi.put(`/tasks/${taskId}`, {
            data: {
              custom_fields: {
                1205844902357505: buildingValues, // Multi-select field values
              },
            },
          });

          if (!isCheckInTask) {
            await createCheckOutSubtasks(response.data.data.gid, dueDate.date); // for check-out tasks
          }
        }
      };

      // Custom fields setup as before
      const customFields = {
        1205769056172791: conferenceTask.custom_fields.find(
          (f) => f.gid === "1205769056172791",
        )?.enum_value.gid,
        1205769057554040: conferenceTask.custom_fields.find(
          (f) => f.gid === "1205769057554040",
        )?.enum_value.gid,
        1205769057554051: conferenceTask.custom_fields.find(
          (f) => f.gid === "1205769057554051",
        )?.enum_value.gid,
        1205769099268143: conferenceTask.custom_fields.find(
          (f) => f.gid === "1205769099268143",
        )?.enum_value.gid,
      };

      // Extract date values
      const staffCheckInDate = conferenceTask.custom_fields.find(
        (f) => f.gid === "1205814574301620",
      )?.date_value;
      const staffCheckOutDate = conferenceTask.custom_fields.find(
        (f) => f.gid === "1205814574301622",
      )?.date_value;
      const participantsCheckInDate = conferenceTask.custom_fields.find(
        (f) => f.gid === "1205769248175820",
      )?.date_value;
      const participantsCheckOutDate = conferenceTask.custom_fields.find(
        (f) => f.gid === "1205769249517032",
      )?.date_value;

      if (participantsCheckInDate && participantsCheckOutDate) {
        await createSingleTask(
          conferenceTask.name + " Participants Check-Out Tasks",
          participantsCheckOutDate,
          "1205946013852183",
          false,
        );
      }

      if (staffCheckInDate && staffCheckOutDate) {
        await createSingleTask(
          conferenceTask.name + " Staff Check-Out Tasks",
          staffCheckOutDate,
          "1205946013852183",
          false,
        );
      }

      setStatusMessage({
        message: "Check-Out Tasks Created Successfully",
        isError: false,
      });
    } catch (error) {
      console.error("Error Creating Check-Out Tasks", error);
      setStatusMessage({
        message: "Error: Failed to Create Check-Out Tasks",
        isError: true,
      });
    }
  };

  const animateProgressBar = (step) => {
    const totalSteps = 5; // total number of steps
    const progress = step / totalSteps;
    progressBarRef.current.animate(progress); // animate the progress bar
  };

  const handleConfirmClick = async () => {
    if (!inputValue) {
      setStatusMessage({
        message: "Error: Please enter a conference name",
        isError: true,
      });
      return;
    }
    setLoading(true);

    try {
      // Step 1: Check for Conference Name
      setCurrentStep(1);
      animateProgressBar(1);
      const matchedTask = await verifyConferenceName(inputValue);
      setStatusMessage({
        message: "Step 1: Verifying Task Name Completed Successfully",
        isError: false,
      });

      // Step 2: Verify Active Status
      setCurrentStep(2);
      animateProgressBar(2);
      const taskDetails = await verifyActiveStatus(matchedTask);
      setStatusMessage({
        message:
          "Step 2: Verifying Conference Status is Active Completed Successfully",
        isError: false,
      });

      // Step 3: Verify Custom Fields
      setCurrentStep(3);
      animateProgressBar(3);
      const verifiedTaskDetails = await verifyCustomFields(taskDetails);
      setStatusMessage({
        message:
          "Step 3: Verifying Additional Conference Custom Fields Completed Successfully",
        isError: false,
      });

      // Steps 4 and 5: Create Check-In and Check-Out Tasks
      setCurrentStep(4);
      animateProgressBar(4);
      await createCheckInTasks(verifiedTaskDetails);
      setStatusMessage({
        message: "Step 4: Creating Check-In Tasks Completed Successfully",
        isError: false,
      });

      setCurrentStep(5);
      animateProgressBar(5);
      await createCheckOutTasks(verifiedTaskDetails);
      setStatusMessage({
        message: "Step 5: Creating Check-Out Tasks Completed Successfully",
        isError: false,
      });

      setStatusMessage({
        message: "Process Completed Successfully",
        isError: false,
      });
    } catch (error) {
      console.error("An error occurred:", error);
      setStatusMessage({ message: error.message, isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <label htmlFor="conferenceInput">
        Please enter the name of the Conference:
      </label>
      <input
        id="conferenceInput"
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
      />
      <button onClick={handleConfirmClick} disabled={!inputValue || loading}>
        {loading ? "Processing..." : "Confirm"}
      </button>
      <div id="progress-container" /> {/* Container for the progress bar */}
      <div className={statusMessage.isError ? "message error" : "message"}>
        {statusMessage.message}
      </div>
    </div>
  );
}

export default App;
