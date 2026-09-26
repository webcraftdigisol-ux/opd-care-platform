import { render, screen, waitFor } from '@testing-library/react-native';
import type { DietPlan, PatientRecordsResponse } from '@opd/shared';
import { RecordsScreen } from '../RecordsScreen';
import { getPatientRecords } from '../../api/patients';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../api/patients');
jest.mock('../../context/AuthContext');
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    React.useEffect(callback, []);
  },
}));

const mockGetPatientRecords = getPatientRecords as jest.MockedFunction<typeof getPatientRecords>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function makeRecords(overrides: Partial<PatientRecordsResponse> = {}): PatientRecordsResponse {
  return {
    patient: { id: 'patient-1', name: 'Ravi Kumar', email: 'ravi@example.com', role: 'PATIENT' } as any,
    appointments: [],
    pharmacySales: [],
    labInvoices: [],
    radiologyInvoices: [],
    attachments: [],
    dietPlans: [],
    ...overrides,
  };
}

function makeDietPlan(overrides: Partial<DietPlan> = {}): DietPlan {
  return {
    id: 'plan-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    consultationId: null,
    admissionId: null,
    createdById: 'doctor-1',
    createdByName: 'Dr. Asha Rao',
    dietaryPreference: 'VEG',
    allergies: null,
    localFoodNotes: null,
    planText: 'High-fiber vegetarian diet, avoid fried food.',
    createdAt: '2026-09-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('RecordsScreen: Diet Plans', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'patient-1', name: 'Ravi Kumar', email: 'ravi@example.com', role: 'PATIENT' } as any,
      clinic: null,
      loading: false,
      setSession: jest.fn(),
      logout: jest.fn(),
    });
  });

  afterEach(() => jest.resetAllMocks());

  it('shows the empty state when there are no records at all, including no diet plans', async () => {
    mockGetPatientRecords.mockResolvedValue(makeRecords());
    render(<RecordsScreen />);

    await waitFor(() => expect(screen.getByText('No medical records yet.')).toBeTruthy());
  });

  it('renders a diet plan with its preference, text, allergies, local food notes and author', async () => {
    mockGetPatientRecords.mockResolvedValue(
      makeRecords({
        dietPlans: [makeDietPlan({ allergies: 'peanuts', localFoodNotes: 'seasonal local greens, millets' })],
      }),
    );
    render(<RecordsScreen />);

    await waitFor(() => expect(screen.getByText('Diet Plans')).toBeTruthy());
    expect(screen.getByText('Vegetarian')).toBeTruthy();
    expect(screen.getByText('High-fiber vegetarian diet, avoid fried food.')).toBeTruthy();
    expect(screen.getByText('Allergies: peanuts')).toBeTruthy();
    expect(screen.getByText('Local food notes: seasonal local greens, millets')).toBeTruthy();
    expect(screen.getByText('From Dr. Asha Rao')).toBeTruthy();
  });

  it('renders multiple diet plans, most recent first as returned by the server', async () => {
    mockGetPatientRecords.mockResolvedValue(
      makeRecords({
        dietPlans: [
          makeDietPlan({ id: 'plan-2', dietaryPreference: 'VEGAN', planText: 'Plant-based recovery diet.' }),
          makeDietPlan({ id: 'plan-1', dietaryPreference: 'VEG', planText: 'High-fiber vegetarian diet, avoid fried food.' }),
        ],
      }),
    );
    render(<RecordsScreen />);

    await waitFor(() => expect(screen.getByText('Plant-based recovery diet.')).toBeTruthy());
    expect(screen.getByText('High-fiber vegetarian diet, avoid fried food.')).toBeTruthy();
    expect(screen.getByText('Vegan')).toBeTruthy();
    expect(screen.getByText('Vegetarian')).toBeTruthy();
  });
});
