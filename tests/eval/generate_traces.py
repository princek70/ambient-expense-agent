import json
import os
import sys
from dotenv import load_dotenv

load_dotenv()

from google.adk.agents.run_config import RunConfig
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# Add project root to python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from expense_agent.agent import root_agent

DATASET_PATH = "tests/eval/datasets/basic-dataset.json"
OUTPUT_PATH = "artifacts/traces/generated_traces.json"

async def main():
    with open(DATASET_PATH, "r") as f:
        dataset = json.load(f)

    session_service = InMemorySessionService()
    generated_cases = []

    for case in dataset["eval_cases"]:
        case_id = case["eval_case_id"]
        print(f"Generating trace for {case_id}...")
        
        session = session_service.create_session_sync(user_id="eval_user", app_name="eval_app")
        runner = Runner(agent=root_agent, session_service=session_service, app_name="eval_app")
        
        prompt_content = case["prompt"]
        parts = [types.Part(text=p["text"]) for p in prompt_content.get("parts", [])]
        message = types.Content(role=prompt_content.get("role", "user"), parts=parts)
        
        events = []
        async for event in runner.run_async(
            new_message=message,
            user_id="eval_user",
            session_id=session.id,
        ):
            events.append(event)
        
        # Check if the session is paused (waiting for human approval)
        is_paused = False
        if events and events[-1].actions and getattr(events[-1].actions, 'pause', False):
            is_paused = True
            
        resume_events = []
        if is_paused:
            print(f"  Session paused for human approval. Intercepting...")
            # Decide approve or reject based on the case ID
            action = "approve" if "approve" in case_id else "reject"
            print(f"  Sending action: {action}")
            
            message2 = types.Content(role="user", parts=[types.Part(text=action)])
            resume_events = []
            async for event in runner.run_async(
                new_message=message2,
                user_id="eval_user",
                session_id=session.id,
            ):
                resume_events.append(event)
        
        # Manually reconstruct the turns since Session.turns is not directly available.
        # We group them into conversational turns (User Prompt -> model events).
        turns = []
        
        # Turn 0: Initial run
        turn_0_events = []
        # Prepend user prompt event
        turn_0_events.append({
            "author": "user",
            "content": {
                "role": "user",
                "parts": prompt_content.get("parts", [])
            }
        })
        # Add events with actual conversational content
        for e in events:
            if getattr(e, "content", None):
                author = getattr(e, "author", "system") or "system"
                turn_0_events.append({
                    "author": author,
                    "content": e.content.model_dump(exclude_none=True, mode='json')
                })
        turns.append({
            "turn_index": 0,
            "events": turn_0_events
        })
        
        # Turn 1: Resume (if paused)
        if is_paused:
            turn_1_events = []
            # Prepend user resume action event
            turn_1_events.append({
                "author": "user",
                "content": {
                    "role": "user",
                    "parts": [{"text": action}]
                }
            })
            # Add events with actual conversational content
            for e in resume_events:
                if getattr(e, "content", None):
                    author = getattr(e, "author", "system") or "system"
                    turn_1_events.append({
                        "author": author,
                        "content": e.content.model_dump(exclude_none=True, mode='json')
                    })
            turns.append({
                "turn_index": 1,
                "events": turn_1_events
            })

        agent_data = {
            "turns": turns,
            "agents": {
                "expense_approval_workflow": {
                    "agent_id": "expense_approval_workflow",
                    "instruction": "Expense approval workflow"
                }
            }
        }
        
        # get last text response
        response_val = "empty"
        if turns:
            last_turn = turns[-1]
            for event in reversed(last_turn["events"]):
                if event["author"] != "user" and event.get("content", {}).get("role") == "model":
                    parts = event.get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        response_val = parts[0]["text"]
                        break

        generated_cases.append({
            "eval_case_id": case_id,
            "agent_data": agent_data,
            "prompt": prompt_content,
            "responses": [
                {
                    "response": {
                        "role": "model",
                        "parts": [{"text": response_val}]
                    }
                }
            ]
        })

    # Write output
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump({"eval_cases": generated_cases}, f, indent=2)
        
    print(f"\nTrace generation complete. Saved {len(generated_cases)} cases to {OUTPUT_PATH}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
