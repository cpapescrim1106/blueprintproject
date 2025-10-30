const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ScoreInputs = {
  patientAgeYears: number | null;
  deviceAgeYears: number | null;
  appointmentsCreated24M: number | null;
  lastAppointmentCompletedMs: number | null;
  thirdPartyBenefitAmount: number | null;
  accountValue: number | null;
};

type ComponentScore = {
  points: number;
  weight: number;
  contribution: number;
};

export type PatientHealthScore = {
  total: number;
  components: {
    age: ComponentScore;
    deviceAge: ComponentScore;
    appointments: ComponentScore;
    recency: ComponentScore;
    benefit: ComponentScore;
    accountValue: ComponentScore;
  };
};

const weights = {
  age: 15,
  deviceAge: 25,
  appointments: 15,
  recency: 15,
  benefit: 10,
  accountValue: 20,
} as const;

const clampToPoints = (value: number): number =>
  Math.max(0, Math.min(100, value));

const scoreAge = (ageYears: number | null): number => {
  if (ageYears === null || Number.isNaN(ageYears)) {
    return 50;
  }
  if (ageYears < 80) {
    return 100;
  }
  if (ageYears < 90) {
    return 80;
  }
  return 50;
};

const scoreDeviceAge = (deviceAgeYears: number | null): number => {
  if (deviceAgeYears === null || Number.isNaN(deviceAgeYears)) {
    return 50;
  }
  if (deviceAgeYears <= 1) {
    return 10;
  }
  if (deviceAgeYears <= 3) {
    return 50;
  }
  if (deviceAgeYears <= 5) {
    return 90;
  }
  return 100;
};

const scoreAppointments = (createdCount: number | null): number => {
  if (createdCount === null || Number.isNaN(createdCount)) {
    return 40;
  }
  if (createdCount <= 0) {
    return 20;
  }
  if (createdCount === 1) {
    return 60;
  }
  if (createdCount <= 3) {
    return 90;
  }
  return 100;
};

const scoreRecency = (lastCompletedMs: number | null): number => {
  if (lastCompletedMs === null) {
    return 30;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.max(
    0,
    Math.round((today.getTime() - lastCompletedMs) / MS_PER_DAY),
  );
  if (diffDays <= 180) {
    return 100;
  }
  if (diffDays <= 365) {
    return 60;
  }
  if (diffDays <= 730) {
    return 30;
  }
  return 10;
};

const scoreBenefit = (benefitAmount: number | null): number => {
  if (benefitAmount === null || Number.isNaN(benefitAmount)) {
    return 50;
  }
  if (benefitAmount >= 2000) {
    return 100;
  }
  if (benefitAmount > 0) {
    return 30;
  }
  return 50;
};

const scoreAccountValue = (accountValue: number | null): number => {
  if (accountValue === null || Number.isNaN(accountValue)) {
    return 40;
  }
  if (accountValue < 1000) {
    return 20;
  }
  if (accountValue < 3000) {
    return 60;
  }
  if (accountValue < 6000) {
    return 85;
  }
  return 100;
};

const component = (points: number, weight: number): ComponentScore => {
  const clamped = clampToPoints(points);
  const contribution = Number(((clamped / 100) * weight).toFixed(2));
  return {
    points: clamped,
    weight,
    contribution,
  };
};

export const calculatePhScore = (inputs: ScoreInputs): PatientHealthScore => {
  const age = component(scoreAge(inputs.patientAgeYears), weights.age);
  const deviceAge = component(
    scoreDeviceAge(inputs.deviceAgeYears),
    weights.deviceAge,
  );
  const appointments = component(
    scoreAppointments(inputs.appointmentsCreated24M),
    weights.appointments,
  );
  const recency = component(
    scoreRecency(inputs.lastAppointmentCompletedMs),
    weights.recency,
  );
  const benefit = component(
    scoreBenefit(inputs.thirdPartyBenefitAmount),
    weights.benefit,
  );
  const accountValueComp = component(
    scoreAccountValue(inputs.accountValue),
    weights.accountValue,
  );

  const total = Number(
    (
      age.contribution +
      deviceAge.contribution +
      appointments.contribution +
      recency.contribution +
      benefit.contribution +
      accountValueComp.contribution
    ).toFixed(2),
  );

  return {
    total,
    components: {
      age,
      deviceAge,
      appointments,
      recency,
      benefit,
      accountValue: accountValueComp,
    },
  };
};
