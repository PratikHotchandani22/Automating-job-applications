"use client"; // Add this line at the top

import React, { useState } from "react";

export default function Home() {
  const [resumeOption, setResumeOption] = useState("existing");
  const [ragIncluded, setRagIncluded] = useState(false);
  const [jobOption, setJobOption] = useState("url");
  const [resumeSelection, setResumeSelection] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null); // State to hold API response

  const handleSubmit = async (e) => {
    e.preventDefault();

    const requestData = {
      resumeOption,
      ragIncluded,
      jobOption,
      resumeSelection,
      jobUrl,
      jobDescription,
    };

    try {
      // Send POST request to backend (Python API)
      const response = await fetch("/api/get_job_data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data); // Save the response data
      } else {
        alert("Failed to fetch results from API");
      }
    } catch (error) {
      console.error("Error fetching job data:", error);
    }
  };

  return (
    <div className="min-h-screen bg-black flex justify-center items-center text-white font-sans">
      <div className="w-full max-w-lg bg-black rounded-lg shadow-xl p-10 space-y-6">
        <h1 className="text-5xl font-extrabold text-center text-white">Is This Job for You?</h1>
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Resume Options */}
          <div className="space-y-4">
            <p className="text-lg font-medium text-gray-300">Choose an option:</p>
            <div className="space-y-3">
              <label className="flex items-center text-gray-200">
                <input
                  type="radio"
                  name="resumeOption"
                  value="existing"
                  checked={resumeOption === "existing"}
                  onChange={() => setResumeOption("existing")}
                  className="mr-3 accent-teal-400"
                />
                <span>Select Existing Resume</span>
              </label>
              <label className="flex items-center text-gray-200">
                <input
                  type="radio"
                  name="resumeOption"
                  value="upload"
                  checked={resumeOption === "upload"}
                  onChange={() => setResumeOption("upload")}
                  className="mr-3 accent-teal-400"
                />
                <span>Upload New Resume</span>
              </label>
            </div>
          </div>

          {/* Select Resume */}
          {resumeOption === "existing" && (
            <div className="space-y-4">
              <label className="block text-lg font-medium text-gray-300">Select a Resume</label>
              <select
                className="w-full p-3 rounded-lg bg-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={resumeSelection}
                onChange={(e) => setResumeSelection(e.target.value)}
              >
                <option value="">Choose an option</option>
                <option value="resume1">Resume 1</option>
                <option value="resume2">Resume 2</option>
              </select>
              <div className="flex items-center mt-3">
                <input
                  type="checkbox"
                  checked={ragIncluded}
                  onChange={() => setRagIncluded(!ragIncluded)}
                  className="mr-3 accent-teal-400"
                />
                <label className="text-gray-200">Include RAG data</label>
              </div>
            </div>
          )}

          {/* Job Description Option */}
          <div className="space-y-4">
            <p className="text-lg font-medium text-gray-300">Choose a Job Option:</p>
            <div className="space-y-2">
              <label className="flex items-center text-gray-200">
                <input
                  type="radio"
                  name="jobOption"
                  value="url"
                  checked={jobOption === "url"}
                  onChange={() => setJobOption("url")}
                  className="mr-3 accent-teal-400"
                />
                <span>Provide Job URL (works only for Glassdoor URLs)</span>
              </label>
              <label className="flex items-center text-gray-200">
                <input
                  type="radio"
                  name="jobOption"
                  value="manual"
                  checked={jobOption === "manual"}
                  onChange={() => setJobOption("manual")}
                  className="mr-3 accent-teal-400"
                />
                <span>Enter job description manually</span>
              </label>
            </div>
            {jobOption === "url" && (
              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Paste the job URL here"
                  className="w-full p-3 rounded-lg bg-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                />
              </div>
            )}
            {jobOption === "manual" && (
              <div className="mt-4">
                <textarea
                  rows="5"
                  placeholder="Enter the job description here"
                  className="w-full p-3 rounded-lg bg-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="mt-8 text-center">
            <button
              type="submit"
              className="w-full py-3 bg-teal-500 hover:bg-teal-600 focus:ring-4 focus:ring-teal-300 text-white font-semibold rounded-lg transition duration-200"
            >
              Submit
            </button>
          </div>
        </form>

        {/* Display the results once the API call is complete */}
        {result && (
          <div className="mt-6 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Job Description</h2>
              <p className="text-lg text-gray-200">{result.jobDescription}</p>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Job Summary</h2>
              <p className="text-lg text-gray-200">{result.jobSummary}</p>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Resume Similarity</h2>
              <table className="w-full text-left table-auto">
                <thead>
                  <tr>
                    <th className="text-white">Resume</th>
                    <th className="text-white">Similarity Score</th>
                  </tr>
                </thead>
                <tbody>
                  {result.resumeSimilarity.map((item, index) => (
                    <tr key={index}>
                      <td className="text-gray-200">{item.resume}</td>
                      <td className="text-gray-200">{item.similarity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Suggestions</h2>
              <ul className="list-disc text-lg text-gray-200">
                {result.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Cover Letter</h2>
              <p className="text-lg text-gray-200">{result.coverLetter}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
