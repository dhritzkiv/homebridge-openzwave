import registerCharacteristic from './Support/registerCharacteristic'

import { IDriverParams } from './Driver'
import multiLevelBinaryTransformer from '../../Values/Transformers/multiLevelBinaryTransformer'
import multiLevelTransformer from '../../Values/Transformers/multiLevelTransformer'

export default function fanMultiLevelDriver(params: IDriverParams) {
	const value = params.values.get(0)

	if (!value) {
		return
	}

	const { Service, Characteristic } = params.hap
	const service = params.accessory.getService(Service.Fanv2)

	if (!service) {
		return
	}

	// On/Off
	registerCharacteristic({
		service,
		params,
		value,
		characteristic: Characteristic.Active,
		options: {
			transformer: multiLevelBinaryTransformer({
				truthy: (Characteristic.Active as any)?.ACTIVE ?? true,
				falsey: (Characteristic.Active as any)?.INACTIVE ?? false,
			}),
		},
	})

	// Speed
	registerCharacteristic({
		service,
		params,
		value: value,
		characteristic: Characteristic.RotationSpeed,
		options: {
			transformer: multiLevelTransformer(),
		},
	})
}
