import ValueCoordinator, { CoordinateValuesParams } from '../../../Values/ValueCoordinator'
import BoundValueStream from '../../../Streams/BoundValueStream'
import makePrefixedLogger from '../../../Support/makePrefixedLogger'
import { Homebridge } from '../../../../types/homebridge'

export type RegisterCharacteristicParams = {
	service: HAPNodeJS.Service
	characteristic: Function
	valueStream: BoundValueStream
	log: Homebridge.Logger
	options?: Partial<CoordinateValuesParams>
}

export default function registerCharacteristic({
	service,
	characteristic,
	valueStream,
	log,
	options,
}: RegisterCharacteristicParams) {
	const characteristicInstance = service?.getCharacteristic(characteristic)

	if (!characteristicInstance) {
		return
	}

	new ValueCoordinator({
		log: makePrefixedLogger(log, (characteristicInstance as any).displayName),
		valueStream,
		characteristic: characteristicInstance,
		...options,
	}).start()
}