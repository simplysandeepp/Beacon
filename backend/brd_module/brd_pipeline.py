"""
brd_pipeline.py
Agents and orchestration for the BRD generation pipeline.
"""
import os
import json
import time
import uuid
from typing import List, Dict, Any, Callable, Optional
from datetime import datetime, timezone
import concurrent.futures

from dotenv import load_dotenv
from pathlib import Path

_HERE = Path(__file__).parent
load_dotenv(_HERE / ".env")

from groq import Groq, APIConnectionError, RateLimitError, APIStatusError
from brd_module.storage import create_snapshot, get_signals_for_snapshot, store_brd_section
from brd_module.hitl.versioned_ledger import is_section_locked, get_section_content, create_new_version

def call_llm_with_retry(client: Groq, messages: List[Dict[str, str]], json_mode: bool = False, max_tokens: int = 2048) -> str:
    """Resilient LLM caller with exponential backoff. Model is resolved from GROQ_MODEL env var
    or defaults to llama-3.3-70b-versatile for improved reasoning quality."""
    MODEL_NAME = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    response_format = {"type": "json_object"} if json_mode else None

    import re

    for attempt in range(3):
        try:
            chat_completion = client.chat.completions.create(
                messages=messages,
                model=MODEL_NAME,
                temperature=0.0,
                max_tokens=max_tokens,
                response_format=response_format,
            )
            raw = chat_completion.choices[0].message.content
            if not raw:
                raise ValueError("Empty response from LLM")

            # Strip HTML tags that the model may hallucinate (preserve <https://...> autolinks)
            clean_md = re.sub(r'<(?!https?://)[^>]+>', '', raw)
            return clean_md.strip()
        except APIConnectionError as e:
            # Network-level failure — always retry with backoff
            if attempt < 2:
                time.sleep(2 ** (attempt + 1))
                continue
            raise Exception(f"LLM connection error after retries: {e}")
        except RateLimitError as e:
            if attempt < 2:
                time.sleep(2 ** (attempt + 1))  # Exponential backoff: 2s, 4s
                continue
            raise Exception(f"LLM rate-limit exceeded: {e}")
        except APIStatusError as e:
            # 4xx/5xx from the API — retry once for transient 5xx, raise for 4xx
            if e.status_code >= 500 and attempt < 2:
                time.sleep(2 ** (attempt + 1))
                continue
            raise Exception(f"LLM API error ({e.status_code}): {e.message}")
        except (ValueError, AttributeError) as e:
            if attempt == 0:
                time.sleep(1)
                continue
            raise Exception(f"LLM parse error: {e}")
        except Exception as e:
            if attempt == 0:
                time.sleep(1)
                continue
            raise Exception(f"Unexpected LLM error: {e}")

    raise Exception("Max retries exceeded")

def functional_requirements_agent(session_id: str, snapshot_id: str, client: Groq = None, additional_context: str = "") -> str:
    if is_section_locked(session_id, 'functional_requirements') and not additional_context:
        return get_section_content(session_id, 'functional_requirements')
    if client is None:
        client = Groq(api_key=os.environ.get("GROQ_CLOUD_API", ""))
        
    reqs = get_signals_for_snapshot(snapshot_id, label_filter='requirement')
    # Cap to 15 most relevant signals to prevent TPM overflow
    reqs = reqs[:15]
    
    if not reqs and not additional_context:
        # Explicit missing data handling
        placeholder = "Insufficient data to generate this section. No requirement signals were found in the provided sources."
        create_new_version(session_id, None, 'functional_requirements', placeholder, 'system', snapshot_id=snapshot_id)
        return placeholder
        
    source_ids = [c.chunk_id for c in reqs]
    
    prompt_text = "You are a senior business analyst synthesizing requirements into a formal BRD section.\n\n"
    prompt_text += "Here are the requirement signals extracted from communications:\n"
    for r in reqs:
        prompt_text += f"[{r.chunk_id}] Speaker: {r.speaker or 'Unknown'} (Source: {r.source_ref})\n"
        prompt_text += f"{r.cleaned_text}\n\n"
        
    prompt_text += """
Instructions:
1. Group related requirements by theme.
2. Number them sequentially.
3. Write each as a clear functional requirement statement starting with 'The system shall...'.
4. Include an inline attribution at the end of each requirement using the source chunk ID like so: [id].
5. EXPLICITLY flag any requirements that appear contradictory or incomplete rather than silently resolving them. Put flags in a "Contradictions / Gaps" section at the end if necessary.
6. STRICTURE: Output ONLY clean Markdown content. NEVER output HTML tags like <p>, <ul>, <li>, or <div>.
Output ONLY the final markdown content for this section. Do not wrap in markdown code blocks.
"""

    if additional_context:
        prompt_text += f"\nADDITIONAL USER INSTRUCTION: {additional_context}\n"
        prompt_text += "Please apply this instruction while generating the section.\n"
        current_content = get_section_content(session_id, 'functional_requirements')
        if current_content:
            prompt_text += f"\nCURRENT SECTION CONTENT (for reference/transformation):\n{current_content}\n"

    messages = [
        {"role": "system", "content": "You are a senior business analyst. You output ONLY valid Markdown. You NEVER use HTML tags like <h3>, <ul>, or <li>. Use Markdown syntax strictly (e.g. ### for headers, - for lists)."},
        {"role": "user", "content": prompt_text}
    ]
    
    try:
        content = call_llm_with_retry(client, messages, json_mode=False)
    except Exception as e:
        content = f"Error generating functional requirements: {e}"
        
    create_new_version(session_id, None, 'functional_requirements', content, 'system', snapshot_id=snapshot_id)
    return content

def stakeholder_analysis_agent(session_id: str, snapshot_id: str, client: Groq = None, additional_context: str = "") -> str:
    if is_section_locked(session_id, 'stakeholder_analysis') and not additional_context:
        return get_section_content(session_id, 'stakeholder_analysis')
    if client is None:
        client = Groq(api_key=os.environ.get("GROQ_CLOUD_API", ""))
        
    all_signals = get_signals_for_snapshot(snapshot_id)
    
    speakers = {}
    feedback_chunks = []
    
    for c in all_signals:
        if c.speaker:
            speakers[c.speaker] = speakers.get(c.speaker, 0) + 1
        if c.label.value == 'stakeholder_feedback':
            feedback_chunks.append(c)
            
    # Cap feedback to 15 signals
    feedback_chunks = feedback_chunks[:15]
            
    unique_speakers = [s for s in speakers.keys() if s and s.lower() != 'unknown' and s.strip() != '']
    
    if len(unique_speakers) < 2 and not additional_context:
        placeholder = "Insufficient data to generate this section. Fewer than 2 unique stakeholders were identified in the source communications."
        create_new_version(session_id, None, 'stakeholder_analysis', placeholder, 'system', snapshot_id=snapshot_id)
        return placeholder
        
    source_ids = [c.chunk_id for c in feedback_chunks]
    
    prompt_text = "You are a senior business analyst compiling a stakeholder analysis for a BRD.\n\n"
    prompt_text += "Here are the named stakeholders identified in the communications, and the number of signals they contributed (indicating influence):\n"
    for spk, count in speakers.items():
        if spk and spk.lower() != 'unknown' and spk.strip() != '':
            prompt_text += f"- {spk} ({count} communications)\n"
            
    prompt_text += "\nHere is all the specific stakeholder feedback extracted:\n"
    if feedback_chunks:
        for r in feedback_chunks:
            prompt_text += f"[{r.chunk_id}] Speaker: {r.speaker or 'Unknown'}\n{r.cleaned_text}\n\n"
    else:
        prompt_text += "None available. Please construct the table using only the named stakeholder list above.\n\n"
        
    prompt_text += """
Instructions:
1. Generate a stakeholder table identifying each named speaker.
2. Columns should include: Stakeholder Name, Apparent Role, Key Concerns/Preferences, and Influence Level (based on communication volume).
3. CRITICAL CONSTRAINT: Do not invent stakeholder roles. Only infer roles if strongly implied by the context. If unknown, write 'Role unknown'.
4. Do not fabricate stakeholder names. If speaker attribution was unavailable for some feedback, explicitly state that in your summary.
5. Provide a brief summary paragraph before the table analyzing the overall stakeholder landscape.
6. STRICTURE: Output ONLY clean Markdown content. NEVER output HTML tags.
Output ONLY the final markdown content for this section. Do not wrap in markdown code blocks.
"""

    if additional_context:
        prompt_text += f"\nADDITIONAL USER INSTRUCTION: {additional_context}\n"
        current_content = get_section_content(session_id, 'stakeholder_analysis')
        if current_content:
            prompt_text += f"\nCURRENT SECTION CONTENT:\n{current_content}\n"

    messages = [
        {"role": "system", "content": "You are a senior business analyst. You output ONLY valid Markdown. You NEVER use HTML tags. Use Markdown tables and headers strictly."},
        {"role": "user", "content": prompt_text}
    ]
    
    try:
        content = call_llm_with_retry(client, messages, json_mode=False)
    except Exception as e:
        content = f"Error generating stakeholder analysis: {e}"
        
    create_new_version(session_id, None, 'stakeholder_analysis', content, 'system', snapshot_id=snapshot_id)
    return content

def timeline_agent(session_id: str, snapshot_id: str, client: Groq = None) -> str:
    if client is None:
        client = Groq(api_key=os.environ.get("GROQ_CLOUD_API", ""))
        
    timeline_refs = get_signals_for_snapshot(snapshot_id, label_filter='timeline_reference')
    # Cap to 15 most relevant signals
    timeline_refs = timeline_refs[:15]
    
    if not timeline_refs:
        placeholder = "No project timeline information was found in the provided sources. Timeline must be established through stakeholder clarification."
        create_new_version(session_id, None, 'timeline', placeholder, 'system', snapshot_id=snapshot_id)
        return placeholder
        
    source_ids = [c.chunk_id for c in timeline_refs]
    
    prompt_text = "You are a senior business analyst compiling a timeline section for a formal BRD.\n\n"
    prompt_text += "Here are the timeline references extracted from project communications:\n"
    for r in timeline_refs:
        prompt_text += f"[{r.chunk_id}] (Source: {r.source_ref})\n"
        prompt_text += f"{r.cleaned_text}\n\n"
        
    prompt_text += """
Instructions:
1. Generate a chronological list of project milestones and deadlines.
2. For each entry, include the date or timeframe and what it refers to.
3. Include an inline attribution at the end of each milestone using the source chunk ID like so: [id].
4. CRITICAL CONSTRAINT: ONLY include dates and timeframes explicitly mentioned. NEVER invent or estimate dates.
5. If a deadline is mentioned without a specific date (e.g. 'go-live'), list the deadline with 'Date not specified'.
6. Do not include random meetings unless they represent a project milestone (like a sign-off or launch).
7. STRICTURE: Output ONLY clean Markdown content. NEVER output HTML tags.
Output ONLY the final markdown content for this section. Do not wrap in markdown code blocks.
"""

    messages = [
        {"role": "system", "content": "You are a senior business analyst. You output ONLY valid Markdown. You NEVER use HTML tags. Use Markdown headers and lists strictly."},
        {"role": "user", "content": prompt_text}
    ]
    
    try:
        content = call_llm_with_retry(client, messages, json_mode=False)
    except Exception as e:
        content = f"Error generating timeline: {e}"
        
    create_new_version(session_id, None, 'timeline', content, 'system', snapshot_id=snapshot_id)
    return content

def decisions_agent(session_id: str, snapshot_id: str, client: Groq = None, additional_context: str = "") -> str:
    if is_section_locked(session_id, 'decisions') and not additional_context:
        return get_section_content(session_id, 'decisions')
    if client is None:
        client = Groq(api_key=os.environ.get("GROQ_CLOUD_API", ""))
        
    decision_refs = get_signals_for_snapshot(snapshot_id, label_filter='decision')
    # Cap to 15 signals
    decision_refs = decision_refs[:15]
    
    if not decision_refs and not additional_context:
        placeholder = "Insufficient data to generate this section. No confirmed decisions were found in the provided sources."
        create_new_version(session_id, None, 'decisions', placeholder, 'system', snapshot_id=snapshot_id)
        return placeholder
        
    source_ids = [c.chunk_id for c in decision_refs]
    prompt_text = "You are a senior business analyst compiling project decisions for a BRD.\n\n"
    prompt_text += "Here are the confirmed decisions extracted from project communications:\n"
    for r in decision_refs:
        prompt_text += f"[{r.chunk_id}] (Source: {r.source_ref})\n{r.cleaned_text}\n\n"
        
    prompt_text += """
Instructions:
1. Output a numbered list of confirmed project decisions.
2. Include an inline attribution using the source chunk ID.
3. EXPLICITLY flag any decisions that appear to contradict each other.
4. STRICTURE: Output ONLY clean Markdown content. NEVER output HTML tags.
Output ONLY the final markdown content for this section.
"""

    messages = [
        {"role": "system", "content": "You are a senior business analyst. You output ONLY valid Markdown. You NEVER use HTML tags. Use Markdown headers and lists strictly."},
        {"role": "user", "content": prompt_text}
    ]
    try:
        content = call_llm_with_retry(client, messages, json_mode=False)
    except Exception as e:
        content = f"Error generating decisions: {e}"
        
    create_new_version(session_id, None, 'decisions', content, 'system', snapshot_id=snapshot_id)
    return content

def assumptions_agent(session_id: str, snapshot_id: str, client: Groq = None, additional_context: str = "") -> str:
    if is_section_locked(session_id, 'assumptions') and not additional_context:
        return get_section_content(session_id, 'assumptions')
    if client is None:
        client = Groq(api_key=os.environ.get("GROQ_CLOUD_API", ""))
        
    all_refs = get_signals_for_snapshot(snapshot_id)
    if not all_refs and not additional_context:
        placeholder = "Insufficient data to generate this section. No signals were found to infer assumptions from."
        create_new_version(session_id, None, 'assumptions', placeholder, 'system', snapshot_id=snapshot_id)
        return placeholder
        
    source_ids = [c.chunk_id for c in all_refs]
    # Cap to 15 most relevant signals to avoid context overflow
    all_refs = all_refs[:15]
    prompt_text = "You are a senior business analyst inferring implicit project assumptions from communications.\n\n"
    for r in all_refs:
        prompt_text += f"[{r.chunk_id}] {r.cleaned_text}\n"
        
    prompt_text += """
Instructions:
1. Infer assumptions implicit in these requirements and decisions (things the project is assuming to be true that are not explicitly stated).
2. Clearly mark output as 'AI-inferred assumptions requiring stakeholder validation'.
3. STRICTURE: Output ONLY clean Markdown content. NEVER output HTML tags.
Output ONLY the final markdown content for this section.
"""

    if additional_context:
        prompt_text += f"\nADDITIONAL USER INSTRUCTION: {additional_context}\n"
        current_content = get_section_content(session_id, 'assumptions')
        if current_content:
            prompt_text += f"\nCURRENT SECTION CONTENT:\n{current_content}\n"

    messages = [
        {"role": "system", "content": "You are a senior business analyst. You output ONLY valid Markdown. You NEVER use HTML tags. Use Markdown headers and lists strictly."},
        {"role": "user", "content": prompt_text}
    ]
    try:
        content = call_llm_with_retry(client, messages, json_mode=False)
    except Exception as e:
        content = f"Error generating assumptions: {e}"
        
    create_new_version(session_id, None, 'assumptions', content, 'system', snapshot_id=snapshot_id)
    return content

def success_metrics_agent(session_id: str, snapshot_id: str, client: Groq = None, additional_context: str = "") -> str:
    if is_section_locked(session_id, 'success_metrics') and not additional_context:
        return get_section_content(session_id, 'success_metrics')
    if client is None:
        client = Groq(api_key=os.environ.get("GROQ_CLOUD_API", ""))
        
    signals = []
    signals.extend(get_signals_for_snapshot(snapshot_id, label_filter='requirement'))
    signals.extend(get_signals_for_snapshot(snapshot_id, label_filter='decision'))
    
    # Cap to 15 signals to prevent TPM overflow
    signals = signals[:15]
    
    if not signals and not additional_context:
        placeholder = "Insufficient data to generate this section. No requirements or decisions were found to derive metrics from."
        create_new_version(session_id, None, 'success_metrics', placeholder, 'system', snapshot_id=snapshot_id)
        return placeholder
        
    source_ids = [c.chunk_id for c in signals]
    prompt_text = "You are a senior business analyst deriving success metrics.\n\n"
    for r in signals:
        prompt_text += f"[{r.chunk_id}] {r.cleaned_text}\n"
        
    prompt_text += """
Instructions:
1. Derive measurable success criteria from the requirements/decisions.
2. If requirements are not measurable, write suggested metrics with a flag that they need stakeholder validation.
3. CRITICAL CONSTRAINT: NEVER invent specific numbers/targets not present in the source data.
4. STRICTURE: Output ONLY clean Markdown content. NEVER output HTML tags.
Output ONLY the final markdown content for this section.
"""

    if additional_context:
        prompt_text += f"\nADDITIONAL USER INSTRUCTION: {additional_context}\n"
        current_content = get_section_content(session_id, 'success_metrics')
        if current_content:
            prompt_text += f"\nCURRENT SECTION CONTENT:\n{current_content}\n"

    messages = [
        {"role": "system", "content": "You are a senior business analyst. You output ONLY valid Markdown. You NEVER use HTML tags. Use Markdown headers and lists strictly."},
        {"role": "user", "content": prompt_text}
    ]
    try:
        content = call_llm_with_retry(client, messages, json_mode=False)
    except Exception as e:
        content = f"Error generating success metrics: {e}"
        
    create_new_version(session_id, None, 'success_metrics', content, 'system', snapshot_id=snapshot_id)
    return content

def executive_summary_agent(session_id: str, snapshot_id: str, client: Groq = None, additional_context: str = "") -> str:
    """Runs LAST after all other agents."""
    if is_section_locked(session_id, 'executive_summary') and not additional_context:
        return get_section_content(session_id, 'executive_summary')
    if client is None:
        client = Groq(api_key=os.environ.get("GROQ_CLOUD_API", ""))
        
    # We need to import this here if it's newly added to storage
    from brd_module.storage import get_latest_brd_sections
    
    sections = get_latest_brd_sections(session_id)
    all_signals = get_signals_for_snapshot(snapshot_id)
    
    # Check for empty / placeholder sections
    insufficient_sections = [name for name, content in sections.items() if "Insufficient data" in content]
    
    total_signals = len(all_signals)
    unique_sources = len(set(s.source_ref for s in all_signals if s.source_ref))
    
    prompt_text = "You are a senior business analyst writing an Executive Summary for a BRD.\n\n"
    prompt_text += "Here are the generated sections from other agents:\n"
    for name, content in sections.items():
        if name != 'executive_summary':
            # Cap each section at 3000 chars to prevent context overflow / repetition loops
            capped = content[:3000] + ("..." if len(content) > 3000 else "")
            prompt_text += f"\n--- {name.upper()} ---\n{capped}\n"
            
    prompt_text += f"\nMetaData: This session processed {total_signals} total signals from {unique_sources} documents.\n"
    
    prompt_text += """
Instructions:
1. Write a 3-5 paragraph executive summary covering:
   - What the project aims to achieve (based on requirements).
   - Who the key stakeholders are.
   - Major constraints or risks (based on decisions/feedback).
2. Honest Completeness Statement: You MUST end the summary with an honest assessment of data completeness.
   - Explicitly state which sections had insufficient data if any.
   - You MUST include a sentence matching this format exactly: "This BRD was generated from <total_signals> signals extracted from <unique_sources> source documents."
3. STRICTURE: Output ONLY clean Markdown content. NEVER output HTML tags.
Output ONLY the final markdown content for this section.
"""

    if additional_context:
        prompt_text += f"\nADDITIONAL USER INSTRUCTION: {additional_context}\n"
        current_content = get_section_content(session_id, 'executive_summary')
        if current_content:
            prompt_text += f"\nCURRENT SECTION CONTENT:\n{current_content}\n"

    messages = [
        {"role": "system", "content": "You are a senior business analyst. You output ONLY valid Markdown. You NEVER use HTML tags. Use Markdown headers and paragraphs strictly."},
        {"role": "user", "content": prompt_text}
    ]
    try:
        content = call_llm_with_retry(client, messages, json_mode=False)
    except Exception as e:
        content = f"Error generating executive summary: {e}"
        
    # Executive summary doesn't directly map to standard source IDs from AKS, it synthesizes.
    create_new_version(session_id, None, 'executive_summary', content, 'system', snapshot_id=snapshot_id)
    return content

def run_brd_generation(
    session_id: str,
    client: Groq = None,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> str:
    """
    Main orchestration function for the BRD generation pipeline.
    Creates the snapshot, runs stages 2-6 in parallel, then runs stage 5 (executive summary).
    """
    if client is None:
        client = Groq(api_key=os.environ.get("GROQ_CLOUD_API", ""))
        
    print(f"[{session_id}] Starting BRD Generation...")

    def emit(event: Dict[str, Any]) -> None:
        if not on_progress:
            return
        try:
            on_progress(event)
        except Exception:
            # Progress reporting must never break generation.
            pass
    
    # Stage 1: Snapshot Creation
    snapshot_id = create_snapshot(session_id)
    print(f"[{session_id}] Snapshot {snapshot_id} created. Freezing DB state for this run.")
    emit({"type": "snapshot_created", "session_id": session_id, "snapshot_id": snapshot_id})
    
    # Define the parallel agents (Stages 2, 3, 4, 6)
    agents_to_run = [
        ("functional_requirements", functional_requirements_agent),
        ("stakeholder_analysis", stakeholder_analysis_agent),
        ("timeline", timeline_agent),
        ("decisions", decisions_agent),
        ("assumptions", assumptions_agent),
        ("success_metrics", success_metrics_agent)
    ]
    
    # Run in parallel using ThreadPoolExecutor (max 4 as per BRD spec)
    print(f"[{session_id}] Launching {len(agents_to_run)} parallel agents...")
    emit({"type": "agents_launched", "count": len(agents_to_run), "session_id": session_id})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        future_to_agent = {}
        for name, func in agents_to_run:
            emit({"type": "agent_started", "agent": name, "session_id": session_id})
            future = executor.submit(func, session_id, snapshot_id, client)
            future_to_agent[future] = name
        
        for future in concurrent.futures.as_completed(future_to_agent):
            name = future_to_agent[future]
            try:
                future.result()
                print(f"  -> Agent completed: {name}")
                emit({"type": "agent_completed", "agent": name, "session_id": session_id})
            except Exception as exc:
                print(f"  -> Agent failed: {name} generated an exception: {exc}")
                emit({
                    "type": "agent_failed",
                    "agent": name,
                    "session_id": session_id,
                    "error": str(exc),
                })
                # The agent itself writes an error placeholder, so we just log and continue.
                
    # Stage 5: Executive Summary (Runs last)
    print(f"[{session_id}] All parallel agents finished. Generating final Executive Summary...")
    emit({"type": "agent_started", "agent": "executive_summary", "session_id": session_id})
    executive_summary_agent(session_id, snapshot_id, client)
    emit({"type": "agent_completed", "agent": "executive_summary", "session_id": session_id})
    print(f"[{session_id}] BRD Generation complete.")
    emit({"type": "generation_completed", "session_id": session_id, "snapshot_id": snapshot_id})
    
    return snapshot_id

def run_single_agent(
    session_id: str, 
    snapshot_id: str, 
    section_name: str, 
    client: Groq,
    additional_context: str = ""
) -> str:
    """Dispatches to a specific agent for ad-hoc regeneration."""
    agent_map = {
        'functional_requirements': functional_requirements_agent,
        'stakeholder_analysis': stakeholder_analysis_agent,
        'timeline': timeline_agent,
        'decisions': decisions_agent,
        'assumptions': assumptions_agent,
        'success_metrics': success_metrics_agent,
        'executive_summary': executive_summary_agent
    }
    
    agent_func = agent_map.get(section_name)
    if not agent_func:
        raise ValueError(f"Unknown section: {section_name}")
        
    return agent_func(session_id, snapshot_id, client, additional_context=additional_context)
