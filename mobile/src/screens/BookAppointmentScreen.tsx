import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DoctorProfile, DoctorSlot } from '@opd/shared';
import { bookAppointment, getDoctorSlots, listDoctors } from '../api/appointments';
import { colors } from '../theme';

export function BookAppointmentScreen({ navigation }: { navigation: any }) {
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listDoctors()
      .then(setDoctors)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDoctor || !date) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    setStartTime(null);
    getDoctorSlots(selectedDoctor, date)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDoctor, date]);

  function selectDoctor(id: string) {
    setSelectedDoctor(id);
    setStartTime(null);
  }

  function changeDate(value: string) {
    setDate(value);
    setStartTime(null);
  }

  async function handleBook() {
    if (!selectedDoctor) {
      Alert.alert('Select a doctor', 'Please choose a doctor to continue.');
      return;
    }
    if (!startTime) {
      Alert.alert('Select a time', 'Please choose an available time slot.');
      return;
    }
    setSubmitting(true);
    try {
      const appointment = await bookAppointment({
        doctorId: selectedDoctor,
        date,
        startTime,
        reason: reason || undefined,
      });
      Alert.alert(
        'Appointment booked',
        `Your ${appointment.startTime} slot is confirmed. Token number is #${appointment.tokenNumber}`,
        [{ text: 'OK', onPress: () => navigation.navigate('MyAppointments') }],
      );
    } catch (err: any) {
      Alert.alert('Booking failed', err.response?.data?.message ?? 'Please try again');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Select Doctor</Text>
      {doctors.map((d) => (
        <Pressable
          key={d.id}
          style={[styles.doctorCard, selectedDoctor === d.id && styles.doctorCardActive]}
          onPress={() => selectDoctor(d.id)}
        >
          <Text style={styles.doctorName}>{d.user.name}</Text>
          <Text style={styles.doctorMeta}>
            {d.specialization} · {d.department}
          </Text>
        </Pressable>
      ))}

      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={date} onChangeText={changeDate} placeholder="2026-09-18" />

      {selectedDoctor && (
        <>
          <Text style={styles.label}>Time slot</Text>
          {slotsLoading && <ActivityIndicator color={colors.teal} style={{ marginTop: 8 }} />}
          {!slotsLoading && slots.length === 0 && (
            <Text style={styles.doctorMeta}>The doctor has no schedule for this day.</Text>
          )}
          {!slotsLoading && slots.length > 0 && (
            <View style={styles.slotGrid}>
              {slots.map((s) => (
                <Pressable
                  key={s.startTime}
                  disabled={!s.available}
                  onPress={() => setStartTime(s.startTime)}
                  style={[
                    styles.slotChip,
                    startTime === s.startTime && styles.slotChipActive,
                    !s.available && styles.slotChipDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.slotChipText,
                      startTime === s.startTime && styles.slotChipTextActive,
                      !s.available && styles.slotChipTextDisabled,
                    ]}
                  >
                    {s.startTime}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      <Text style={styles.label}>Reason (optional)</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="Briefly describe your symptoms"
      />

      <Pressable style={styles.button} onPress={handleBook} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Confirm Booking</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 16, marginBottom: 8 },
  doctorCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  doctorCardActive: { borderColor: colors.teal, backgroundColor: colors.tealLight },
  doctorName: { fontWeight: '600', fontSize: 15, color: colors.ink },
  doctorMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  slotChipActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  slotChipDisabled: { borderColor: colors.border, backgroundColor: '#F5F5F3' },
  slotChipText: { fontSize: 13, color: colors.ink },
  slotChipTextActive: { color: '#fff', fontWeight: '600' },
  slotChipTextDisabled: { color: colors.muted, textDecorationLine: 'line-through' },
  button: {
    backgroundColor: colors.teal,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
