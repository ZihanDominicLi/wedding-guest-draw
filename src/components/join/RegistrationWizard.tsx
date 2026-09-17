"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { ChildrenStep } from "./ChildrenStep";
import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  saveRegistrationDraft,
} from "./draft";
import { IdentityStep } from "./IdentityStep";
import { OriginStep } from "./OriginStep";
import { RegistrationSuccess } from "./RegistrationSuccess";
import type { RegistrationFormValues } from "./types";

type RegistrationResult = {
  guestId: string;
  attendanceNumber: number;
  displayName: string;
  primaryGroup: { key: string; name: string } | null;
  grouped: boolean;
  created: boolean;
};

type RegistrationWizardProps = {
  coupleLabel: string;
  registrationOpen: boolean;
};

const stepFields: Record<1 | 2, (keyof RegistrationFormValues)[]> = {
  1: ["name", "phoneLast4", "relation"],
  2: ["childCount"],
};

export function RegistrationWizard({
  coupleLabel,
  registrationOpen,
}: RegistrationWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    reset,
    setValue,
    control,
    getValues,
    trigger,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormValues>({
    defaultValues: {
      name: "",
      phoneLast4: "",
      relation: "MUTUAL_FRIEND",
      childCount: 0,
      originProvince: "",
      originCity: "",
    },
  });
  const values = useWatch({ control }) as RegistrationFormValues;
  const childCount = useWatch({ control, name: "childCount" }) ?? 0;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const draft = loadRegistrationDraft();
      if (draft) {
        reset({
          name: draft.name,
          phoneLast4: draft.phoneLast4,
          relation: draft.relation as RegistrationFormValues["relation"],
          childCount: draft.childCount,
          originProvince: draft.originProvince,
          originCity: draft.originCity,
        });
        setStep(draft.step as 1 | 2 | 3);
        setIdempotencyKey(draft.idempotencyKey);
        return;
      }
      setIdempotencyKey(crypto.randomUUID());
    });
    return () => {
      cancelled = true;
    };
  }, [reset]);

  function persistDraft(nextStep: 1 | 2 | 3) {
    const key = idempotencyKey || crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);
    saveRegistrationDraft({ ...getValues(), step: nextStep, idempotencyKey: key });
  }

  async function next() {
    if (step === 3) return;
    const valid = await trigger(stepFields[step]);
    if (!valid) return;
    const nextStep = (step + 1) as 2 | 3;
    persistDraft(nextStep);
    setStep(nextStep);
  }

  function previous() {
    if (step === 1) return;
    const previousStep = (step - 1) as 1 | 2;
    persistDraft(previousStep);
    setStep(previousStep);
  }

  const submit = handleSubmit(async (formValues) => {
    setSubmitError("");
    const key = idempotencyKey || crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);
    saveRegistrationDraft({ ...formValues, step: 3, idempotencyKey: key });

    try {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(formValues),
      });
      const payload = await response.json();
      if (!response.ok) {
        setSubmitError(payload.error?.message ?? "登记失败，请稍后重试");
        return;
      }
      clearRegistrationDraft();
      setResult(payload.data);
    } catch {
      setSubmitError("网络连接中断，请检查网络后重试");
    }
  });

  if (result) return <RegistrationSuccess result={result} />;

  if (!registrationOpen) {
    return (
      <section className="registration-closed">
        <p>Registration paused</p>
        <h1>现场登记暂未开放</h1>
        <span>请稍后再次扫码，或联系现场工作人员。</span>
      </section>
    );
  }

  return (
    <form className="registration-wizard" onSubmit={submit} noValidate>
      <header className="wizard-header">
        <p>{coupleLabel}</p>
        <span>第 {step} 步，共 3 步</span>
        <div className="progress-track" aria-hidden="true">
          <i style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </header>

      <div className="wizard-stage">
        {step === 1 ? <IdentityStep register={register} errors={errors} /> : null}
        {step === 2 ? (
          <ChildrenStep
            register={register}
            errors={errors}
            setValue={setValue}
            childCount={childCount}
          />
        ) : null}
        {step === 3 ? (
          <OriginStep register={register} errors={errors} values={values} />
        ) : null}
      </div>

      {submitError ? <p className="submit-error" role="alert">{submitError}</p> : null}

      <footer className="wizard-actions">
        {step > 1 ? (
          <button className="secondary-action" type="button" onClick={previous}>
            <ArrowLeft size={19} aria-hidden="true" />
            上一步
          </button>
        ) : <span />}
        {step < 3 ? (
          <button className="primary-action" type="button" onClick={next}>
            下一步
            <ArrowRight size={19} aria-hidden="true" />
          </button>
        ) : (
          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="spin" size={19} /> : null}
            {isSubmitting ? "正在登记" : "确认登记"}
          </button>
        )}
      </footer>
    </form>
  );
}
